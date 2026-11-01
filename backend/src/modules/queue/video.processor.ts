import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { VIDEO_QUEUE, processesJobs } from './queue.constants';
import { VideoRecoveryService } from './recovery.service';
import { AppConfig } from '../../config/configuration';
import { VideosService } from '../videos/videos.service';
import { ProgressEventsService } from '../events/progress.events';
import { AiService, MAX_VIDEO_SECONDS } from '../ai/ai.service';
import { DalleService } from '../image-generator/dalle.service';
import { SlidesService } from '../slides/slides.service';
import { OpenAiTtsService } from '../voice/openai-tts.service';
import { AudioAlignmentService } from '../voice/audio-alignment.service';
import { RendererService } from '../renderer/renderer.service';
import { YouTubeService } from '../youtube/youtube.service';
import { WebhookService } from '../webhook/webhook.service';
import { InstitutionsService } from '../institutions/institutions.service';
import { CostsService } from '../costs/costs.service';
import { StorageService } from '../storage/storage.service';
import { VideoJob } from '../database/entities/video-job.entity';
import { GeneratedScript, STEP_PROGRESS } from '../../common/types';
import { priceRender, priceStt } from '../costs/cost-config';
import * as path from 'path';
import * as fs from 'fs';


interface VideoJobData {
  jobId: string;
}

/** Cada cuánto el worker marca que sigue vivo mientras monta un video. */
const HEARTBEAT_MS = 60_000;

// autorun: false — el worker solo arranca en el proceso que monta videos (ver processesJobs).
// lockDuration amplio: un paso pesado puede tener el bucle de eventos ocupado unos segundos.
@Processor(VIDEO_QUEUE, { autorun: false, concurrency: 1, lockDuration: 120_000 })
export class VideoProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(VideoProcessor.name);

  constructor(
    private readonly videosService: VideosService,
    private readonly eventsService: ProgressEventsService,
    private readonly aiService: AiService,
    private readonly dalleService: DalleService,
    private readonly slidesService: SlidesService,
    private readonly openAiTtsService: OpenAiTtsService,
    private readonly audioAlignmentService: AudioAlignmentService,
    private readonly rendererService: RendererService,
    private readonly youTubeService: YouTubeService,
    private readonly webhookService: WebhookService,
    private readonly institutionsService: InstitutionsService,
    private readonly costsService: CostsService,
    private readonly storageService: StorageService,
    private readonly recoveryService: VideoRecoveryService,
    private readonly configService: ConfigService<AppConfig>,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    if (!processesJobs()) {
      this.logger.log('[VideoProcessor] Este proceso no monta videos (solo el worker)');
      return;
    }
    const concurrency = this.configService.get<AppConfig['queue']>('queue')?.concurrency ?? 1;
    this.worker.concurrency = concurrency > 0 ? concurrency : 1;
    this.logger.log(`[VideoProcessor] Worker activo: hasta ${this.worker.concurrency} videos a la vez`);
    void this.worker.run();
  }

  async process(bullJob: Job<VideoJobData>): Promise<void> {
    const { jobId } = bullJob.data;
    // Un mismo video puede tener varios jobs en Redis (reintento automático, manual, vigilante):
    // solo uno lo procesa; los demás ven que ya está en curso o terminado y no hacen nada.
    if (!(await this.videosService.claim(jobId))) {
      this.logger.log(`[VideoProcessor] [${jobId}] Ya en proceso o sin nada pendiente — job ${bullJob.id} omitido`);
      return;
    }
    this.logger.log(`[VideoProcessor] [${jobId}] Iniciando procesamiento`);
    const heartbeat = setInterval(() => void this.videosService.heartbeat(jobId).catch(() => undefined), HEARTBEAT_MS);

    const videoJob = await this.videosService.findById(jobId);
    const completed = videoJob.completed_steps ?? [];

    const institution = videoJob.institution_id
      ? await this.institutionsService.findById(videoJob.institution_id)
      : null;

    const steps = [
      { key: 'analyzing_content', fn: (): Promise<void> => this.analyzeContent(videoJob) },
      { key: 'generating_script', fn: (): Promise<void> => this.generateScript(videoJob) },
      { key: 'generating_scenes', fn: (): Promise<void> => Promise.resolve() },
      {
        key: 'generating_images_and_audio',
        skipOnDryRun: false,
        fn: (): Promise<void> => this.generateImagesAndAudio(videoJob),
      },
      { key: 'generating_slides', fn: (): Promise<void> => this.generateSlides(videoJob) },
      { key: 'rendering_dry_run', isDryRunOnly: true, fn: (): Promise<void> => this.renderDryRunVideo(videoJob), isDryRunEnd: true },
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

      await this.videosService.clearRetryState(jobId);
      await this.recoveryService.markHealthy();
      this.logger.log(`[VideoProcessor] [${jobId}] Completado: ${finalStatus}`);
    } catch (err: unknown) {
      this.logger.error(`[VideoProcessor] [${jobId}] Error: ${err instanceof Error ? err.message : String(err)}`);
      await this.recoveryService.handleFailure(jobId, err).catch((e: unknown) =>
        this.logger.error(`[VideoProcessor] [${jobId}] No se pudo registrar el error: ${e instanceof Error ? e.message : String(e)}`),
      );
    } finally {
      clearInterval(heartbeat);
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
      reveal_cues: Array.isArray(s.reveal_cues) ? s.reveal_cues : null,
      icons: s.icons ?? null,
      image_precision: s.image_precision ?? null,
      image_style: s.image_style ?? null,
      image_check: s.image_check ?? null,
      ui_demo: s.layout_type === 'software_demo' ? s.ui_demo ?? null : null,
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

  private async generateImagesAndAudio(staleJob: VideoJob): Promise<void> {
    // El job se cargó antes de generar el guion: recargarlo para tener generated_script (visual_family)
    const job = await this.videosService.findById(staleJob.id);
    const scenes = await this.videosService.getScenes(job.id);

    if (job.dry_run) {
      // Dry run: solo imágenes, audio no es necesario
      this.logger.log(`[VideoProcessor] [${job.id}] dry_run: generando solo imágenes`);
      await this.dalleService.generateAllImages(job, scenes);
      const thumbnail = await this.dalleService.generateThumbnail(job);
      if (thumbnail) {
        await this.videosService['videoJobRepo'].update(job.id, { thumbnail_url: thumbnail });
      }
    } else {
      // Producción: imágenes + audio en paralelo
      this.logger.log(`[VideoProcessor] [${job.id}] Generando imágenes y audio en paralelo`);
      await Promise.all([
        this.dalleService.generateAllImages(job, scenes).then(async () => {
          const thumbnail = await this.dalleService.generateThumbnail(job);
          if (thumbnail) {
            await this.videosService['videoJobRepo'].update(job.id, { thumbnail_url: thumbnail });
          }
        }),
        this.generateAudio(job),
      ]);
    }
  }

  private async generateSlides(job: VideoJob): Promise<void> {
    const scenes = await this.videosService.getScenes(job.id);
    // Slides animados: los tiempos de la voz deciden cuándo aparece cada elemento
    if (this.slidesService.isAnimated(job)) {
      await this.audioAlignmentService.alignScenes(job, scenes);
    }
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

  private async generateAudio(job: VideoJob): Promise<void> {
    const scenes = await this.videosService.getScenes(job.id);
    const meta = job.external_metadata as Record<string, string> | null;

    // OpenAI es el único proveedor de TTS. Integraciones antiguas pueden seguir enviando
    // tts_provider (p. ej. 'elevenlabs'); se ignora y se usa OpenAI.
    if (meta?.tts_provider && meta.tts_provider !== 'openai') {
      this.logger.warn(
        `[VideoProcessor] [${job.id}] tts_provider "${meta.tts_provider}" ya no está soportado — usando OpenAI`,
      );
    }

    await this.openAiTtsService.generateAllAudio(job, scenes, {
      voice: meta?.tts_voice, // sin tts_voice → voz por defecto del servicio (cedar)
      model: meta?.tts_model, // sin tts_model → default del servicio (snapshot fijado)
    });

    await this.logRealAudioDuration(job);
  }

  /** Solo informa la duración real del audio: ya no se alarga la narración para llegar a un mínimo. */
  private async logRealAudioDuration(job: VideoJob): Promise<void> {
    const scenes = await this.videosService.getScenes(job.id);
    const totalSeconds = scenes.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
    const msg = `[VideoProcessor] [${job.id}] Duración real de audio: ${this.formatDuration(totalSeconds)} (${scenes.length} escenas)`;
    if (totalSeconds > MAX_VIDEO_SECONDS + 30) this.logger.warn(`${msg} — supera el tope de ${MAX_VIDEO_SECONDS / 60} min`);
    else this.logger.log(msg);
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
    const renderPrice = priceRender(result.durationSeconds);
    await this.videosService.logApiUsage({
      videoJobId: job.id,
      institutionId: job.institution_id,
      provider: 'internal',
      operation: 'render',
      inputUnits: Math.round(result.durationSeconds),
      estimatedCost: renderPrice.cost,
      unitType: 'seconds',
      metadata: {
        duration_seconds: Math.round(result.durationSeconds),
        scenes_count: scenes.length,
        resolution: '1920x1080',
        fps: 30,
        pricing: renderPrice.pricing,
      },
    });

    // Log subtitle transcription (Whisper) cost
    if (result.stt && result.stt.calls > 0) {
      const sttPrice = priceStt(result.stt.model, result.stt.audioSeconds);
      await this.videosService.logApiUsage({
        videoJobId: job.id,
        institutionId: job.institution_id,
        provider: 'openai_stt',
        operation: 'subtitles_transcription',
        inputUnits: Math.round(result.stt.audioSeconds),
        estimatedCost: sttPrice.cost,
        modelName: result.stt.model,
        unitType: 'seconds',
        metadata: {
          audio_seconds: result.stt.audioSeconds,
          calls: result.stt.calls,
          pricing: sttPrice.pricing,
        },
      });
    }
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

  private getHost(): string {
    return `http://localhost:${process.env.PORT ?? '3500'}`;
  }
}
