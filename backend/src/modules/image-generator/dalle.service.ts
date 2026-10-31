import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';
import { AppConfig } from '../../config/configuration';
import { GeneratedScript } from '../../common/types';
import { VideoJob } from '../database/entities/video-job.entity';
import { VideoScene } from '../database/entities/video-scene.entity';
import { VideosService } from '../videos/videos.service';
import { imageUsageFromResponse, priceChat, priceImage } from '../costs/cost-config';

// Modelos que la API ya no acepta para generar: se reemplazan por el default vigente
const RETIRED_IMAGE_MODELS = new Set(['dall-e-2', 'dall-e-3', 'gpt-image-1']);
const DEFAULT_IMAGE_MODEL = 'gpt-image-1-mini';
const SUPPORTED_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);

const NO_TEXT = 'No text, no labels, no letters, no numbers, no watermark.';

type ImageFamily = 'illustration' | 'realistic';

interface VisionVerdict {
  ok: boolean;
  problems: string;
}

@Injectable()
export class DalleService {
  private readonly logger = new Logger(DalleService.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly modelPrecise: string;
  private readonly visionModel: string;
  private readonly size: string;
  private readonly quality: string;
  private readonly basePath: string;
  private readonly limit = pLimit(4);

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly videosService: VideosService,
  ) {
    const cfg = this.configService.get<AppConfig['openai']>('openai')!;
    this.client = new OpenAI({ apiKey: cfg.apiKey });
    this.model = this.currentModel(cfg.imageModel);
    this.modelPrecise = this.currentModel(cfg.imageModelPrecise);
    this.visionModel = cfg.visionModel;
    this.size = SUPPORTED_SIZES.has(cfg.imageSize) ? cfg.imageSize : '1536x1024';
    // Nombres de calidad de dall-e: standard→medium, hd→high
    const qualityRaw = cfg.imageQuality;
    this.quality = qualityRaw === 'standard' ? 'medium' : qualityRaw === 'hd' ? 'high' : qualityRaw;
    this.basePath = this.configService.get<AppConfig['storage']>('storage')?.basePath ?? '/tmp/video-engine';
  }

  async generateAllImages(job: VideoJob, scenes: VideoScene[]): Promise<void> {
    const aiScenes = scenes.filter(s => s.requires_ai_image !== false);
    const cssScenes = scenes.length - aiScenes.length;

    this.logger.log(
      `[DalleService] [${job.id}] ${scenes.length} escenas detectadas. ` +
      `${aiScenes.length} requieren imagen IA (estilo ${this.family(job)}). ` +
      `${cssScenes} serán renderizadas con layouts HTML/CSS.`,
    );

    if (aiScenes.length === 0) {
      this.logger.log(`[DalleService] [${job.id}] Sin imágenes IA que generar.`);
      return;
    }

    const imagesDir = path.join(this.basePath, 'jobs', job.id, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });

    await Promise.all(
      aiScenes.map((scene) =>
        this.limit(() => this.generateSceneImage(job, scene, imagesDir)),
      ),
    );

    this.logger.log(
      `[DalleService] [${job.id}] ${aiScenes.length} imágenes IA procesadas. ${cssScenes} resueltas con CSS.`,
    );
  }

  private async generateSceneImage(
    job: VideoJob,
    scene: VideoScene,
    imagesDir: string,
  ): Promise<void> {
    const outputPath = path.join(imagesDir, `scene_${scene.scene_order}.png`);
    const precise = this.isPrecise(scene);
    const model = precise ? this.modelPrecise : this.model;
    const basePrompt = `${scene.image_prompt ?? ''} ${this.styleSuffix(job, scene)}`;
    const check = scene.image_check?.trim() || null;

    // Hasta 2 pasadas: si la verificación de visión encuentra errores, se regenera
    // pidiendo explícitamente lo que faltó; si vuelve a fallar, la escena queda sin imagen
    // (el slide usa tarjetas con iconos) en vez de mostrar algo incorrecto.
    let prompt = basePrompt;
    for (let pass = 1; pass <= 2; pass++) {
      const b64 = await this.generate(job, model, prompt, 'image_generation', scene.scene_order);
      if (!b64) break;

      if (precise && check) {
        const verdict = await this.verify(job, b64, check, scene.scene_order);
        if (!verdict.ok) {
          this.logger.warn(
            `[DalleService] [${job.id}] Escena ${scene.scene_order} no pasó la verificación (pasada ${pass}/2): ${verdict.problems}`,
          );
          prompt = `${basePrompt} It is essential that: ${check}. Fix these problems: ${verdict.problems}`;
          continue;
        }
      }

      fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
      await this.videosService.updateScene(scene.id, { image_url: outputPath });
      this.logger.log(
        `[DalleService] [${job.id}] Escena ${scene.scene_order} — imagen generada (${model}${precise ? ', precisión alta' : ''})`,
      );
      return;
    }

    this.logger.error(
      `[DalleService] [${job.id}] Escena ${scene.scene_order}: sin imagen válida. Continuando sin imagen.`,
    );
  }

  async generateThumbnail(job: VideoJob): Promise<string | null> {
    this.logger.log(`[DalleService] [${job.id}] Generando thumbnail`);

    const outputDir = path.join(this.basePath, 'jobs', job.id, 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'thumbnail.png');

    const prompt =
      `Eye-catching cover image for an educational video about '${job.title}': one strong, ` +
      `clear central subject that represents the topic. ${this.styleSuffix(job, null)}`;

    const b64 = await this.generate(job, this.modelPrecise, prompt, 'thumbnail_generation', null);
    if (!b64) return null;
    fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
    this.logger.log(`[DalleService] [${job.id}] Thumbnail generado: ${outputPath}`);
    return outputPath;
  }

  // ─── Estilo y modelo ─────────────────────────────────────────────────────

  private family(job: VideoJob): ImageFamily {
    const script = job.generated_script as GeneratedScript | null;
    return script?.visual_family === 'realistic' ? 'realistic' : 'illustration';
  }

  /** Portada, gancho y escenas marcadas como precisión alta van con el modelo preciso. */
  private isPrecise(scene: VideoScene): boolean {
    return scene.image_precision === 'high' || scene.layout_type === 'cover' || scene.scene_type === 'hook';
  }

  private styleSuffix(job: VideoJob, scene: VideoScene | null): string {
    const primary = job.brand_primary_color || '#003366';
    const secondary = job.brand_secondary_color || '#00AEEF';
    if (this.family(job) === 'realistic') {
      if (scene?.image_style === 'atlas') {
        return 'Realistic medical and scientific illustration in the quality of a modern anatomy atlas: accurate ' +
          'proportions and textures, soft studio lighting, subtle depth, clean light neutral background, calm and ' +
          `professional. ${NO_TEXT}`;
      }
      return 'Photorealistic image, natural soft lighting, shallow depth of field, clean and professional real-world ' +
        `setting, realistic skin and materials, calm and respectful. ${NO_TEXT}`;
    }
    return 'Flat editorial vector illustration, clean geometric shapes, soft gradients and a subtle grain texture. ' +
      `Limited palette: ${primary} and ${secondary}, with small warm accents in coral and soft yellow, on a light ` +
      'neutral background #F6F7F9. Gentle depth with soft shadows, friendly and modern, generous negative space. ' +
      NO_TEXT;
  }

  private currentModel(configured: string): string {
    if (!configured || RETIRED_IMAGE_MODELS.has(configured)) {
      this.logger.warn(`[DalleService] Modelo de imagen "${configured}" retirado — usando ${DEFAULT_IMAGE_MODEL}`);
      return DEFAULT_IMAGE_MODEL;
    }
    return configured;
  }

  // ─── Llamadas a la API ───────────────────────────────────────────────────

  /** Genera una imagen (3 intentos ante errores de API) y registra su costo. Devuelve base64 o null. */
  private async generate(
    job: VideoJob,
    model: string,
    prompt: string,
    operation: string,
    sceneOrder: number | null,
  ): Promise<string | null> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await this.client.images.generate({
          model,
          prompt,
          n: 1,
          size: this.size as '1536x1024',
          quality: this.quality as 'auto' | 'low' | 'medium' | 'high',
        });

        const b64 = response.data?.[0]?.b64_json;
        if (!b64) throw new Error('API de imágenes no devolvió datos');

        const usage = imageUsageFromResponse(response);
        const price = priceImage(model, this.size, this.quality, usage);
        await this.videosService.logApiUsage({
          videoJobId: job.id,
          institutionId: job.institution_id,
          provider: 'openai_dalle',
          operation,
          inputUnits: 1,
          estimatedCost: price.cost,
          modelName: model,
          unitType: 'images',
          metadata: {
            image_count: 1,
            size: this.size,
            quality: this.quality,
            ...(sceneOrder != null ? { scene_order: sceneOrder } : {}),
            ...(usage
              ? {
                  text_input_tokens: usage.textInputTokens ?? 0,
                  image_input_tokens: usage.imageInputTokens ?? 0,
                  output_tokens: usage.outputTokens ?? 0,
                }
              : {}),
            pricing: price.pricing,
          },
        });
        return b64;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[DalleService] [${job.id}] ${operation}${sceneOrder != null ? ` escena ${sceneOrder}` : ''} intento ${attempt}/3: ${msg}`,
        );
        if (attempt < 3) await this.sleep(2000);
      }
    }
    return null;
  }

  /** Revisa con un modelo de visión que la imagen cumpla image_check. Si la revisión falla, se acepta la imagen. */
  private async verify(job: VideoJob, b64: string, check: string, sceneOrder: number): Promise<VisionVerdict> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.visionModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Revisas imágenes para videos educativos. Evalúas SOLO si la imagen cumple los requisitos ' +
              'indicados, con rigor técnico. Responde JSON: {"ok": boolean, "problems": "qué está mal, en una frase, o vacío"}.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Requisitos que deben verse correctos: ${check}` },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}`, detail: 'high' } },
            ],
          },
        ],
      });

      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;
      const modelName = response.model ?? this.visionModel;
      const price = priceChat(modelName, inputTokens, outputTokens);
      await this.videosService.logApiUsage({
        videoJobId: job.id,
        institutionId: job.institution_id,
        provider: 'openai_chat',
        operation: 'image_verification',
        inputUnits: inputTokens,
        outputUnits: outputTokens,
        estimatedCost: price.cost,
        modelName,
        unitType: 'tokens',
        metadata: { scene_order: sceneOrder, pricing: price.pricing },
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as Partial<VisionVerdict>;
      return { ok: parsed.ok !== false, problems: String(parsed.problems ?? '') };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[DalleService] [${job.id}] Verificación de escena ${sceneOrder} no disponible: ${msg}`);
      return { ok: true, problems: '' };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
