import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { VIDEO_QUEUE } from './queue.constants';
import { VideosService } from '../videos/videos.service';
import { ProgressEventsService } from '../events/progress.events';
import { AiService } from '../ai/ai.service';
import { DalleService } from '../image-generator/dalle.service';
import { SlidesService } from '../slides/slides.service';
import { ElevenLabsService } from '../voice/elevenlabs.service';
import { RendererService } from '../renderer/renderer.service';
import { YouTubeService } from '../youtube/youtube.service';
import { WebhookService } from '../webhook/webhook.service';
import { InstitutionsService } from '../institutions/institutions.service';
import { CostsService } from '../costs/costs.service';
import { StorageService } from '../storage/storage.service';
import { VideoJob } from '../database/entities/video-job.entity';
import { VideoScene } from '../database/entities/video-scene.entity';
import { GeneratedScript, STEP_PROGRESS } from '../../common/types';
import * as path from 'path';
import * as fs from 'fs';

interface VideoJobData {
  jobId: string;
}

@Processor(VIDEO_QUEUE)
export class VideoProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoProcessor.name);

  constructor(
    private readonly videosService: VideosService,
    private readonly eventsService: ProgressEventsService,
    private readonly aiService: AiService,
    private readonly dalleService: DalleService,
    private readonly slidesService: SlidesService,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly rendererService: RendererService,
    private readonly youTubeService: YouTubeService,
    private readonly webhookService: WebhookService,
    private readonly institutionsService: InstitutionsService,
    private readonly costsService: CostsService,
    private readonly storageService: StorageService,
  ) {
    super();
  }

  async process(bullJob: Job<VideoJobData>): Promise<void> {
    const { jobId } = bullJob.data;
    this.logger.log(`[VideoProcessor] [${jobId}] Iniciando procesamiento`);

    const videoJob = await this.videosService.findById(jobId);
    const completed = videoJob.completed_steps ?? [];

    const institution = videoJob.institution_id
      ? await this.institutionsService.findById(videoJob.institution_id)
      : null;

    const steps = [
      { key: 'analyzing_content', fn: (): Promise<void> => this.analyzeContent(videoJob) },
      { key: 'generating_script', fn: (): Promise<void> => this.generateScript(videoJob) },
      { key: 'generating_scenes', fn: (): Promise<void> => Promise.resolve() },
      { key: 'generating_images', fn: (): Promise<void> => this.generateImages(videoJob) },
      { key: 'generating_slides', fn: (): Promise<void> => this.generateSlides(videoJob) },
      { key: 'rendering_dry_run', isDryRunOnly: true, fn: (): Promise<void> => this.renderDryRunVideo(videoJob), isDryRunEnd: true },
      { key: 'generating_audio', skipOnDryRun: true, fn: (): Promise<void> => this.generateAudio(videoJob, institution) },
      { key: 'rendering_video', skipOnDryRun: true, fn: (): Promise<void> => this.renderVideo(videoJob) },
      { key: 'uploading_youtube', skipOnDryRun: true, skipIfNoCredentials: true, fn: (): Promise<void> => this.uploadYouTube(videoJob, institution) },
    ];

    try {
      for (const step of steps) {
        if (completed.includes(step.key)) {
          this.logger.log(`[VideoProcessor] [${jobId}] ${step.key} ya completado — saltando`);
          continue;
        }
        if (videoJob.dry_run && step.skipOnDryRun) continue;
        if (!videoJob.dry_run && step.isDryRunOnly) continue;
        if (step.skipIfNoCredentials && !this.youTubeService.hasCredentials(videoJob, institution)) continue;

        const progress = STEP_PROGRESS[step.key] ?? 0;
        await this.videosService.updateProgress(jobId, step.key, progress);
        const freshJob = await this.videosService.findById(jobId);
        this.eventsService.emitProgress(freshJob);

        await step.fn();
        await this.videosService.markStepCompleted(jobId, step.key);

        if (videoJob.dry_run && step.isDryRunEnd) break;
      }

      // Calculate and persist total cost for this job
      await this.costsService.calculateAndSaveJobCosts(jobId);

      const finalJob = await this.videosService.findById(jobId);
      this.eventsService.emitCompleted(finalJob, this.getHost());

      const script = finalJob.generated_script as GeneratedScript | null;
      const finalStatus = videoJob.dry_run ? 'dry_run_completed' : 'completed_local';

      if (videoJob.dry_run) {
        await this.webhookService.sendDryRun(
          finalJob,
          script?.guiding_question ?? '',
          finalJob.scenes_count ?? 0,
        );
      } else {
        await this.webhookService.sendSuccess(finalJob, this.getHost());
      }

      this.logger.log(`[VideoProcessor] [${jobId}] Completado: ${finalStatus}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      const safeMessage = this.sanitizeErrorMessage(message);

      this.logger.error(`[VideoProcessor] [${jobId}] Error: ${safeMessage}`);

      await this.videosService.markFailed(jobId, safeMessage);
      const failedJob = await this.videosService.findById(jobId);
      this.eventsService.emitFailed(failedJob, failedJob.current_step);
      await this.webhookService.sendFailure(failedJob, failedJob.current_step);
    }
  }

  private async analyzeContent(job: VideoJob): Promise<void> {
    this.logger.log(`[VideoProcessor] [${job.id}] Analizando contenido`);
    const wordCount = job.content_txt.split(/\s+/).length;
    this.logger.log(`[VideoProcessor] [${job.id}] ${wordCount} palabras detectadas`);
  }

  private async generateScript(job: VideoJob): Promise<void> {
    this.logger.log(`[VideoProcessor] [${job.id}] Generando guion con GPT-4o`);
    const script = await this.aiService.generateScript(job);

    const scenes = script.scenes.map((s) => ({
      scene_order: s.scene_order,
      scene_type: s.scene_type,
      layout_type: s.layout_type ?? null,
      requires_ai_image: s.requires_ai_image ?? true,
      learning_goal: s.learning_goal,
      title: s.title,
      narration: s.narration,
      on_screen_text: s.on_screen_text,
      visual_direction: s.visual_direction,
      image_prompt: s.image_prompt ?? null,
      highlight_words: s.highlight_words,
      transition: s.transition,
      estimated_duration_seconds: s.estimated_duration_seconds,
    }));

    await this.videosService.saveScenes(job.id, scenes);
    await this.videosService['videoJobRepo'].update(job.id, {
      scenes_count: script.scenes.length,
    });
  }

  private async generateImages(job: VideoJob): Promise<void> {
    const scenes = await this.videosService.getScenes(job.id);
    await this.dalleService.generateAllImages(job, scenes);
    const thumbnail = await this.dalleService.generateThumbnail(job);
    if (thumbnail) {
      await this.videosService['videoJobRepo'].update(job.id, {
        thumbnail_url: thumbnail,
      });
    }
  }

  private async generateSlides(job: VideoJob): Promise<void> {
    const scenes = await this.videosService.getScenes(job.id);
    await this.slidesService.renderAllSlides(job, scenes);
  }

  private async renderDryRunVideo(job: VideoJob): Promise<void> {
    const scenes = await this.videosService.getScenes(job.id);
    const result = await this.rendererService.renderDryRun(job, scenes);
    await this.videosService.markCompleted(job.id, {
      status: 'dry_run_completed',
      localMp4Available: true,
      localMp4Path: result.outputPath,
      durationSeconds: Math.round(result.durationSeconds),
      scenesCount: scenes.length,
    });
  }

  private async generateAudio(job: VideoJob, institution: typeof job.institution): Promise<void> {
    const scenes = await this.videosService.getScenes(job.id);
    await this.elevenLabsService.generateAllAudio(job, scenes, institution);
    await this.ensureRealAudioDuration(job, institution);
  }

  private async ensureRealAudioDuration(
    job: VideoJob,
    institution: typeof job.institution,
  ): Promise<void> {
    const TARGET_SECONDS = 420;
    const HARD_MIN_SECONDS = 390;
    const MAX_CYCLES = 2;
    const SKIP_TYPES = new Set(['hook', 'summary', 'conclusion']);

    for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
      const scenes = await this.videosService.getScenes(job.id);
      const totalSeconds = scenes.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
      const label = this.formatDuration(totalSeconds);

      if (totalSeconds >= TARGET_SECONDS) {
        this.logger.log(
          `[VideoProcessor] [${job.id}] Duración real de audio: ${label} (${Math.round(totalSeconds)}s / ${scenes.length} escenas) ✓`,
        );
        return;
      }

      const missingSeconds = TARGET_SECONDS - totalSeconds;
      this.logger.warn(
        `[VideoProcessor] [${job.id}] [DurationFix] Audio total: ${Math.round(totalSeconds)}s (${label}). ` +
        `Objetivo: ${TARGET_SECONDS}s. Faltan ${Math.round(missingSeconds)}s. Ciclo ${cycle}/${MAX_CYCLES}`,
      );

      // Find candidate scenes to expand
      const candidates = scenes.filter(s => {
        if (SKIP_TYPES.has(s.scene_type ?? '')) return false;
        const wordCount = (s.narration ?? '').split(/\s+/).filter(Boolean).length;
        if (wordCount > 160) return false;
        if ((s.duration_seconds ?? 0) > 35) return false;
        return (s.duration_seconds ?? 0) < 22 || wordCount < 100;
      }).slice(0, 8);

      if (candidates.length === 0) {
        this.logger.warn(`[VideoProcessor] [${job.id}] [DurationFix] No hay escenas candidatas para expandir`);
        break;
      }

      this.logger.log(
        `[VideoProcessor] [${job.id}] [DurationFix] Expandiendo ${candidates.length} escenas candidatas`,
      );

      let expansions: Array<{ scene_order: number; narration: string }>;
      try {
        expansions = await this.aiService.expandSceneNarrationsForDuration({
          job,
          scenesToExpand: candidates,
          missingSeconds,
          sourceContent: job.content_txt,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[VideoProcessor] [${job.id}] [DurationFix] GPT expansión falló: ${msg}`);
        break;
      }

      if (expansions.length === 0) {
        this.logger.warn(`[VideoProcessor] [${job.id}] [DurationFix] GPT no devolvió expansiones válidas`);
        break;
      }

      // Update narrations in DB + delete old audio files
      const expandedScenes: VideoScene[] = [];
      const sceneMap = new Map(scenes.map(s => [s.scene_order, s]));

      for (const exp of expansions) {
        const scene = sceneMap.get(exp.scene_order);
        if (!scene) continue;

        // Delete old audio file
        if (scene.audio_url && fs.existsSync(scene.audio_url)) {
          try { fs.rmSync(scene.audio_url, { force: true }); } catch { /* non-critical */ }
        }

        await this.videosService.updateScene(scene.id, {
          narration: exp.narration,
          duration_seconds: 0,
          audio_url: null as unknown as string,
        });

        expandedScenes.push({ ...scene, narration: exp.narration });
      }

      // Regenerate only the expanded scenes' audio
      await this.elevenLabsService.regenerateScenesAudio(job, expandedScenes, institution);
    }

    // Final check after all cycles
    const finalScenes = await this.videosService.getScenes(job.id);
    const finalTotal = finalScenes.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
    const finalLabel = this.formatDuration(finalTotal);

    if (finalTotal < HARD_MIN_SECONDS) {
      throw new Error(
        `Duración real insuficiente tras ${MAX_CYCLES} ciclos de expansión: ${Math.round(finalTotal)}s (${finalLabel}). ` +
        `Mínimo requerido: ${HARD_MIN_SECONDS}s (6:30 min). ` +
        `El contenido educativo puede ser demasiado corto para generar un video de 7 minutos. ` +
        `Intenta con más contenido o un tema más extenso.`,
      );
    }

    if (finalTotal < TARGET_SECONDS) {
      this.logger.warn(
        `[VideoProcessor] [${job.id}] AVISO: duración final = ${finalLabel} (${Math.round(finalTotal)}s). ` +
        `Dentro del margen aceptable (${HARD_MIN_SECONDS}–${TARGET_SECONDS - 1}s).`,
      );
    } else {
      this.logger.log(
        `[VideoProcessor] [${job.id}] Duración final: ${finalLabel} (${Math.round(finalTotal)}s) ✓`,
      );
    }
  }

  private formatDuration(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.round(totalSeconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  private async renderVideo(job: VideoJob): Promise<void> {
    const scenes = await this.videosService.getScenes(job.id);
    const result = await this.rendererService.render(job, scenes);

    const localThumbnailPath = path.join(
      process.env.STORAGE_BASE_PATH ?? '/tmp/video-engine',
      'jobs', job.id, 'output', 'thumbnail.png',
    );

    // Upload to R2 when driver=r2, otherwise keep local paths
    const { mp4Url, thumbnailUrl } = await this.storageService.uploadJobOutput(
      job.id,
      result.outputPath,
      fs.existsSync(localThumbnailPath) ? localThumbnailPath : undefined,
    );

    if (this.storageService.isR2()) {
      this.logger.log(`[VideoProcessor] [${job.id}] Outputs uploaded to R2`);
    }

    await this.videosService.markCompleted(job.id, {
      status: 'completed_local',
      localMp4Available: true,
      localMp4Path: mp4Url,
      durationSeconds: Math.round(result.durationSeconds),
      scenesCount: scenes.length,
      thumbnailUrl: thumbnailUrl ?? localThumbnailPath,
    });

    // Log render infrastructure cost
    await this.videosService.logApiUsage({
      videoJobId: job.id,
      institutionId: job.institution_id,
      provider: 'internal',
      operation: 'render',
      inputUnits: Math.round(result.durationSeconds),
      estimatedCost: (result.durationSeconds / 60) * 0.02,
      unitType: 'seconds',
      metadata: { duration_seconds: Math.round(result.durationSeconds), scenes_count: scenes.length, resolution: '1920x1080', fps: 30 },
    });
  }

  private async uploadYouTube(job: VideoJob, institution: typeof job.institution): Promise<void> {
    const result = await this.youTubeService.upload(job, institution);
    if (result) {
      await this.videosService.markCompleted(job.id, {
        status: 'completed',
        localMp4Available: true,
        youtubeUrl: result.youtubeUrl,
        embedUrl: result.embedUrl,
        youtubeVideoId: result.videoId,
      });
    }
  }

  private sanitizeErrorMessage(message: string): string {
    return message
      .replace(/sk-[a-zA-Z0-9\-_]{20,}/g, '[REDACTED_KEY]')
      .replace(/Bearer\s+[a-zA-Z0-9\-_.]{10,}/g, 'Bearer [REDACTED]')
      .replace(/xi-api-key[:\s]+[a-zA-Z0-9\-_]{10,}/gi, 'xi-api-key: [REDACTED]')
      .substring(0, 500);
  }

  private getHost(): string {
    return `http://localhost:${process.env.PORT ?? '3500'}`;
  }
}
