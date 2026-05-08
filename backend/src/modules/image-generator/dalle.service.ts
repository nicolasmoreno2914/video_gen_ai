import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';
import { AppConfig } from '../../config/configuration';
import { VideoJob } from '../database/entities/video-job.entity';
import { VideoScene } from '../database/entities/video-scene.entity';
import { VideosService } from '../videos/videos.service';

const DOODLE_SUFFIX =
  'White background only. No text, no letters, no numbers. ' +
  'Hand-drawn educational doodle style. Clean lines. ' +
  'Minimal color palette. Academic illustration. No photography.';

const FALLBACK_PROMPTS: Record<string, string> = {
  hook: 'Question mark lightbulb educational doodle, white background, hand-drawn',
  context: 'World map connecting arrows educational doodle, white background',
  explanation: 'Simple diagram boxes arrows educational sketch, white background',
  process: 'Step-by-step numbered flowchart doodle, white background',
  example: 'Magnifying glass document educational doodle, white background',
  comparison: 'Two columns balance scale educational doodle, white background',
  application: 'Gears tools academic doodle, white background',
  summary: 'Checklist checkmarks educational illustration, white background',
  conclusion: 'Star graduation cap achievement doodle, white background',
};

@Injectable()
export class DalleService {
  private readonly logger = new Logger(DalleService.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly size: string;
  private readonly quality: string;
  private readonly basePath: string;
  private readonly limit = pLimit(2);

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly videosService: VideosService,
  ) {
    const cfg = this.configService.get<AppConfig['openai']>('openai')!;
    this.client = new OpenAI({ apiKey: cfg.apiKey });
    this.model = cfg.imageModel;
    this.size = cfg.imageSize as '1792x1024';
    this.quality = cfg.imageQuality as 'standard' | 'hd';
    this.basePath = this.configService.get<AppConfig['storage']>('storage')?.basePath ?? '/tmp/video-engine';
  }

  async generateAllImages(job: VideoJob, scenes: VideoScene[]): Promise<void> {
    const aiScenes = scenes.filter(s => s.requires_ai_image !== false).slice(0, 8);
    const cssScenes = scenes.length - aiScenes.length;

    this.logger.log(
      `[DalleService] [${job.id}] ${scenes.length} escenas detectadas. ` +
      `${aiScenes.length} requieren imagen IA. ` +
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
      `[DalleService] [${job.id}] ${aiScenes.length} imágenes IA generadas. ${cssScenes} resueltas con CSS.`,
    );
  }

  private async generateSceneImage(
    job: VideoJob,
    scene: VideoScene,
    imagesDir: string,
  ): Promise<void> {
    const outputPath = path.join(imagesDir, `scene_${scene.scene_order}.png`);
    const prompt = `${scene.image_prompt ?? ''} ${DOODLE_SUFFIX}`;
    const sceneType = scene.scene_type ?? 'explanation';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const usedPrompt = attempt === 1 ? prompt : `${FALLBACK_PROMPTS[sceneType] ?? FALLBACK_PROMPTS['explanation']} ${DOODLE_SUFFIX}`;

        const response = await this.client.images.generate({
          model: this.model,
          prompt: usedPrompt,
          n: 1,
          size: this.size as '1792x1024',
          quality: this.quality as 'standard' | 'hd',
          style: 'natural',
          response_format: 'url',
        });

        const imageUrl = response.data?.[0]?.url;
        if (!imageUrl) throw new Error('DALL-E no devolvió URL de imagen');

        await this.downloadImage(imageUrl, outputPath);

        await this.videosService.updateScene(scene.id, {
          image_url: outputPath,
        });

        await this.videosService.logApiUsage({
          videoJobId: job.id,
          institutionId: job.institution_id,
          provider: 'openai_dalle',
          operation: 'image_generation',
          inputUnits: 1,
          estimatedCost: 0.04,
          modelName: this.model,
          unitType: 'images',
          metadata: { image_count: 1, size: this.size, quality: this.quality, scene_order: scene.scene_order },
        });

        this.logger.log(
          `[DalleService] [${job.id}] Escena ${scene.scene_order} — imagen generada`,
        );
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[DalleService] [${job.id}] Escena ${scene.scene_order} intento ${attempt}/3: ${msg}`,
        );
        if (attempt < 3) await this.sleep(2000);
      }
    }

    this.logger.error(
      `[DalleService] [${job.id}] Escena ${scene.scene_order}: falló con todos los prompts. Continuando sin imagen.`,
    );
  }

  async generateThumbnail(job: VideoJob): Promise<string | null> {
    this.logger.log(`[DalleService] [${job.id}] Generando thumbnail`);

    const outputDir = path.join(this.basePath, 'jobs', job.id, 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'thumbnail.png');

    const prompt =
      `Eye-catching YouTube educational thumbnail, doodle illustration, ` +
      `white background, icons representing '${job.title}', ` +
      `professional educational design, hand-drawn academic style, no text. ` +
      DOODLE_SUFFIX;

    try {
      const response = await this.client.images.generate({
        model: this.model,
        prompt,
        n: 1,
        size: '1792x1024',
        quality: this.quality as 'standard' | 'hd',
        style: 'natural',
        response_format: 'url',
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) throw new Error('No URL returned');

      await this.downloadImage(imageUrl, outputPath);

      await this.videosService.logApiUsage({
        videoJobId: job.id,
        institutionId: job.institution_id,
        provider: 'openai_dalle',
        operation: 'thumbnail_generation',
        inputUnits: 1,
        estimatedCost: 0.04,
        modelName: this.model,
        unitType: 'images',
        metadata: { image_count: 1, size: '1792x1024', quality: this.quality },
      });

      this.logger.log(`[DalleService] [${job.id}] Thumbnail generado: ${outputPath}`);
      return outputPath;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[DalleService] [${job.id}] Thumbnail fallido: ${msg}`);
      return null;
    }
  }

  private async downloadImage(url: string, outputPath: string): Promise<void> {
    const response = await axios.get<Buffer>(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(outputPath, Buffer.from(response.data));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
