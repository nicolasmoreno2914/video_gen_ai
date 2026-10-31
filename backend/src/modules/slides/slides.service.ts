import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';
import { AppConfig } from '../../config/configuration';
import { VideoJob } from '../database/entities/video-job.entity';
import { VideoScene } from '../database/entities/video-scene.entity';
import { VideosService } from '../videos/videos.service';
import { getVideoTheme, VideoTheme } from './theme';
import {
  buildConceptMapTemplate, buildCycleTemplate, buildIconCardsTemplate, buildTimelineTemplate,
} from './templates/diagrams.template';
import {
  buildBigStatEditorialTemplate, buildComparisonEditorialTemplate, buildConclusionEditorialTemplate,
  buildCoverTemplate, buildLevelsEditorialTemplate, buildQuestionEditorialTemplate, buildSplitTemplate,
  buildPracticeTemplate, buildStepsEditorialTemplate, buildSummaryEditorialTemplate,
} from './templates/layouts.template';
import { SceneTimeline } from './templates/animation';
import { captureKeyframes } from './keyframe-capture';
import { computeRevealTimes } from './reveal-timing';

export interface BrandData {
  primaryColor: string;
  secondaryColor: string;
  institutionName: string;
  logoBase64: string | null;
}

export interface SlideTemplateData {
  scene: VideoScene;
  brand: BrandData;
  imageBase64: string | null;
  requiresAiImage: boolean;
  /** Si está presente, la plantilla incluye el runtime de animación (captura por fotogramas). */
  timeline?: SceneTimeline | null;
}

const HIERARCHY_KEYWORDS = [
  'nivel', 'niveles', 'capa', 'capas', 'orden', 'grado', 'escala',
  'organización', 'jerarquía', 'categoría', 'tipo', 'clase', 'rango',
  'básico', 'intermedio', 'avanzado', 'superior', 'inferior',
  'átomo', 'molécula', 'célula', 'tejido', 'órgano', 'sistema',
  'primario', 'secundario', 'terciario',
  'fase', 'etapa', 'paso', 'escalón',
];

const STAT_PATTERN = /\d[\d.,]*\s*[%$€£kmKMBb+\-x×]/;

function isHierarchical(texts: string[]): boolean {
  const joined = texts.join(' ').toLowerCase();
  const matches = HIERARCHY_KEYWORDS.filter(k => joined.includes(k));
  const allShort = texts.every(t => t.split(/\s+/).length <= 5);
  return matches.length >= 2 || (allShort && texts.length >= 4);
}

function hasKeyStats(texts: string[]): boolean {
  return texts.slice(0, 2).some(t => STAT_PATTERN.test(t));
}

function isQuestion(title: string, texts: string[]): boolean {
  return title.includes('?') || (texts[0] ?? '').includes('?');
}

@Injectable()
export class SlidesService {
  private readonly logger = new Logger(SlidesService.name);
  private readonly basePath: string;
  private readonly executablePath: string;
  private readonly limit = pLimit(3);
  private readonly animated: boolean;
  private readonly fps: number;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly videosService: VideosService,
  ) {
    this.basePath =
      this.configService.get<AppConfig['storage']>('storage')?.basePath ?? '/tmp/video-engine';
    this.executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium';
    const video = this.configService.get<AppConfig['video']>('video');
    this.animated = video?.animatedSlides ?? false;
    this.fps = video?.fps ?? 30;
  }

  /** true si los slides de este job se renderizan animados (requiere audio, no aplica a dry-run). */
  isAnimated(job: VideoJob): boolean {
    return this.animated && !job.dry_run;
  }

  /** Lista de fotogramas (demuxer concat de FFmpeg) de una escena animada, si existe. */
  static framesListPath(slidePngPath: string, sceneOrder: number): string {
    return path.join(path.dirname(slidePngPath), `scene_${sceneOrder}`, 'frames.txt');
  }

  async renderAllSlides(job: VideoJob, scenes: VideoScene[]): Promise<void> {
    this.logger.log(`[SlidesService] [${job.id}] Renderizando ${scenes.length} slides`);

    const slidesDir = path.join(this.basePath, 'jobs', job.id, 'slides');
    fs.mkdirSync(slidesDir, { recursive: true });

    const theme = getVideoTheme(job.id);
    this.logger.log(`[SlidesService] [${job.id}] Tema visual: bg=${theme.background} header=${theme.headerStyle} bullets=${theme.bulletStyle} img=${theme.imagePosition}`);

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: this.executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    try {
      await Promise.all(
        scenes.map((scene) =>
          this.limit(() => this.renderSlide(browser, job, scene, slidesDir, theme)),
        ),
      );
    } finally {
      await browser.close();
    }

    this.logger.log(`[SlidesService] [${job.id}] Todos los slides renderizados`);
  }

  private async renderSlide(
    browser: puppeteer.Browser,
    job: VideoJob,
    scene: VideoScene,
    slidesDir: string,
    theme: VideoTheme,
  ): Promise<void> {
    const outputPath = path.join(slidesDir, `scene_${scene.scene_order}.png`);

    const brand: BrandData = {
      primaryColor: job.brand_primary_color ?? '#003366',
      secondaryColor: job.brand_secondary_color ?? '#00AEEF',
      institutionName: job.brand_institution_name ?? 'Video Engine IA',
      logoBase64: this.loadLogoBase64(job.brand_logo_url),
    };

    const requiresAiImage = scene.requires_ai_image !== false;
    const imageBase64 = requiresAiImage ? this.loadImageBase64(scene.image_url) : null;

    if (requiresAiImage && !imageBase64) {
      this.logger.warn(
        `[SlidesService] [${job.id}] Escena ${scene.scene_order} (${scene.layout_type ?? scene.scene_type}): ` +
        `requires_ai_image=true pero imagen NO disponible → fallback a layout full-width premium. ` +
        `image_url="${scene.image_url ?? 'null'}"`,
      );
    }

    const duration = scene.duration_seconds ?? 0;
    const animate = this.isAnimated(job) && duration > 0;
    const timeline: SceneTimeline | null = animate
      ? { revealTimes: computeRevealTimes(this.sceneTexts(scene), scene.reveal_cues, scene.word_timings, duration) }
      : null;

    const html = this.buildSlideHTML({ scene, brand, imageBase64, requiresAiImage, timeline }, theme);

    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
      // 'load' espera la hoja de Google Fonts; luego se esperan las fuentes (máx. 5 s).
      // Con 'domcontentloaded' la captura salía con la fuente de respaldo del sistema.
      await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
      await page.evaluate(() =>
        Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]).then(() => undefined),
      );
      if (timeline) {
        const framesDir = path.dirname(SlidesService.framesListPath(outputPath, scene.scene_order));
        fs.rmSync(framesDir, { recursive: true, force: true });
        const { frameCount } = await captureKeyframes(page, framesDir, duration, this.fps);
        // Estado final como PNG: thumbnail, dry-run y respaldo si falta la lista de fotogramas
        await page.evaluate((t: number) => {
          (window as unknown as { __anim?: { seek(t: number): void } }).__anim?.seek(t);
        }, duration);
        this.logger.log(
          `[SlidesService] [${job.id}] Slide ${scene.scene_order} animado: ${frameCount} fotogramas, ` +
          `apariciones en ${timeline.revealTimes.map((t) => t.toFixed(1)).join('/')}s`,
        );
      }
      await page.screenshot({ path: outputPath, type: 'png' });

      await this.videosService.updateScene(scene.id, { slide_png_url: outputPath });

      this.logger.log(`[SlidesService] [${job.id}] Slide ${scene.scene_order} OK`);
    } finally {
      await page.close();
    }
  }

  private sceneTexts(scene: VideoScene): string[] {
    const rawTexts = scene.on_screen_text ?? [];
    return Array.isArray(rawTexts) ? rawTexts : typeof rawTexts === 'string' ? [rawTexts] : [];
  }

  buildSlideHTML(data: SlideTemplateData, theme: VideoTheme): string {
    const { scene } = data;
    const layout = scene.layout_type ?? null;
    const texts = this.sceneTexts(scene);
    const title = scene.title ?? '';

    const hasImage = data.requiresAiImage && !!data.imageBase64;
    // Imagen + ideas si hay imagen; si no (por diseño o porque falló), tarjetas con iconos
    const split = (imageFirst = false): string =>
      hasImage ? buildSplitTemplate(data, imageFirst) : buildIconCardsTemplate(data);

    // layout_type es el criterio principal
    if (layout) {
      switch (layout) {
        case 'cover':              return buildCoverTemplate(data);
        case 'guiding_question':   return buildQuestionEditorialTemplate(data);
        case 'big_stat':           return buildBigStatEditorialTemplate(data);
        case 'content_split':      return split();
        case 'hierarchy_diagram':  return buildLevelsEditorialTemplate(data);
        case 'process_steps':      return buildStepsEditorialTemplate(data);
        case 'comparison':         return buildComparisonEditorialTemplate(data);
        case 'real_example':       return split(true);
        case 'summary_checklist':  return buildSummaryEditorialTemplate(data);
        case 'conclusion_reflection': return buildConclusionEditorialTemplate(data);
        case 'icon_cards':         return buildIconCardsTemplate(data);
        case 'cycle_diagram':      return buildCycleTemplate(data);
        case 'concept_map':        return buildConceptMapTemplate(data);
        case 'timeline':           return buildTimelineTemplate(data);
        case 'practice_question':  return buildPracticeTemplate(data);
      }
    }

    // Fallback por scene_type + heurísticas de contenido
    const type = scene.scene_type ?? 'explanation';
    switch (type) {
      case 'hook':
        return isQuestion(title, texts)
          ? buildQuestionEditorialTemplate(data)
          : buildCoverTemplate(data);
      case 'context':
        return hasKeyStats(texts) ? buildBigStatEditorialTemplate(data) : split();
      case 'explanation':
        return isHierarchical(texts) ? buildLevelsEditorialTemplate(data) : split();
      case 'process':      return buildStepsEditorialTemplate(data);
      case 'comparison':   return buildComparisonEditorialTemplate(data);
      case 'application':
      case 'example':      return split(true);
      case 'summary':      return buildSummaryEditorialTemplate(data);
      case 'conclusion':   return buildConclusionEditorialTemplate(data);
      default:             return split();
    }
  }

  private loadLogoBase64(logoUrl: string | null): string | null {
    if (!logoUrl) return null;
    try {
      // Relative URLs like /api/storage/logos/<key> → resolve to disk path
      const storagePath = process.env.STORAGE_BASE_PATH ?? '/tmp/video-engine';
      const localPath = logoUrl.startsWith('/api/storage/')
        ? path.join(storagePath, logoUrl.replace('/api/storage/', ''))
        : logoUrl; // absolute path or full URL — try as-is
      if (!fs.existsSync(localPath)) return null;
      const ext = path.extname(localPath).toLowerCase().replace('.', '') || 'png';
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      const b64 = fs.readFileSync(localPath).toString('base64');
      return `data:${mime};base64,${b64}`;
    } catch {
      return null;
    }
  }

  private loadImageBase64(imagePath: string | null): string | null {
    if (!imagePath) return null;
    try {
      if (!fs.existsSync(imagePath)) return null;
      return fs.readFileSync(imagePath).toString('base64');
    } catch {
      return null;
    }
  }
}
