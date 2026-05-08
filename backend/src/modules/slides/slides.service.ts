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
import { buildTitleTemplate } from './templates/title.template';
import { buildContentTemplate } from './templates/content.template';
import { buildStepsTemplate } from './templates/steps.template';
import { buildSummaryTemplate } from './templates/summary.template';
import { buildConclusionTemplate } from './templates/conclusion.template';
import { buildQuestionTemplate } from './templates/question.template';
import { buildBigStatTemplate } from './templates/big-stat.template';
import { buildComparisonTemplate } from './templates/comparison.template';
import { buildLevelsTemplate } from './templates/levels.template';
import { buildExampleCardTemplate } from './templates/example-card.template';

export interface BrandData {
  primaryColor: string;
  secondaryColor: string;
  institutionName: string;
  logoUrl: string | null;
}

export interface SlideTemplateData {
  scene: VideoScene;
  brand: BrandData;
  imageBase64: string | null;
  requiresAiImage: boolean;
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
  private readonly limit = pLimit(2);

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly videosService: VideosService,
  ) {
    this.basePath =
      this.configService.get<AppConfig['storage']>('storage')?.basePath ?? '/tmp/video-engine';
    this.executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium';
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
      logoUrl: job.brand_logo_url,
    };

    const requiresAiImage = scene.requires_ai_image !== false;
    const imageBase64 = requiresAiImage ? this.loadImageBase64(scene.image_url) : null;
    const html = this.buildSlideHTML({ scene, brand, imageBase64, requiresAiImage }, theme);

    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.screenshot({ path: outputPath, type: 'png' });

      await this.videosService.updateScene(scene.id, { slide_png_url: outputPath });

      this.logger.log(`[SlidesService] [${job.id}] Slide ${scene.scene_order} OK`);
    } finally {
      await page.close();
    }
  }

  buildSlideHTML(data: SlideTemplateData, theme: VideoTheme): string {
    const { scene } = data;
    const layout = scene.layout_type ?? null;
    const texts = scene.on_screen_text ?? [];
    const title = scene.title ?? '';

    // layout_type es el criterio principal
    if (layout) {
      switch (layout) {
        case 'cover':              return buildTitleTemplate(data, theme);
        case 'guiding_question':   return buildQuestionTemplate(data, theme);
        case 'big_stat':           return buildBigStatTemplate(data, theme);
        case 'content_split':      return buildContentTemplate(data, theme);
        case 'hierarchy_diagram':  return buildLevelsTemplate(data, theme);
        case 'process_steps':      return buildStepsTemplate(data, theme);
        case 'comparison':         return buildComparisonTemplate(data, theme);
        case 'real_example':       return buildExampleCardTemplate(data, theme);
        case 'summary_checklist':  return buildSummaryTemplate(data, theme);
        case 'conclusion_reflection': return buildConclusionTemplate(data, theme);
      }
    }

    // Fallback por scene_type + heurísticas de contenido
    const type = scene.scene_type ?? 'explanation';
    switch (type) {
      case 'hook':
        return isQuestion(title, texts)
          ? buildQuestionTemplate(data, theme)
          : buildTitleTemplate(data, theme);
      case 'context':
        return hasKeyStats(texts)
          ? buildBigStatTemplate(data, theme)
          : buildContentTemplate(data, theme);
      case 'explanation':
        return isHierarchical(texts)
          ? buildLevelsTemplate(data, theme)
          : buildContentTemplate(data, theme);
      case 'process':      return buildStepsTemplate(data, theme);
      case 'comparison':   return buildComparisonTemplate(data, theme);
      case 'application':
      case 'example':      return buildExampleCardTemplate(data, theme);
      case 'summary':      return buildSummaryTemplate(data, theme);
      case 'conclusion':   return buildConclusionTemplate(data, theme);
      default:             return buildContentTemplate(data, theme);
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
