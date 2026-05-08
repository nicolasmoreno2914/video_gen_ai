import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as fs from 'fs';

export interface SceneInsertData {
  scene_order: number;
  scene_type?: string | null;
  learning_goal?: string | null;
  title?: string | null;
  narration?: string | null;
  on_screen_text?: string[] | null;
  visual_direction?: string | null;
  image_prompt?: string | null;
  highlight_words?: string[] | null;
  transition?: string;
  image_url?: string | null;
  slide_png_url?: string | null;
  audio_url?: string | null;
  duration_seconds?: number | null;
  estimated_duration_seconds?: number | null;
}
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoJob } from '../database/entities/video-job.entity';
import { VideoScene } from '../database/entities/video-scene.entity';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { CreateVideoDto } from './dto/create-video.dto';
import { VideoStatusResponse } from './dto/video-status.dto';
import { VideoStatus, STEP_LABELS, ApiProvider } from '../../common/types';

@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);

  constructor(
    @InjectRepository(VideoJob)
    private readonly videoJobRepo: Repository<VideoJob>,
    @InjectRepository(VideoScene)
    private readonly videoSceneRepo: Repository<VideoScene>,
    @InjectRepository(ApiUsageLog)
    private readonly usageLogRepo: Repository<ApiUsageLog>,
  ) {}

  async create(dto: CreateVideoDto): Promise<{
    job: VideoJob;
    isRegeneration: boolean;
    previousJobId: string | null;
  }> {
    let isRegeneration = false;
    let previousJobId: string | null = null;

    const existing = await this.videoJobRepo.findOne({
      where: {
        course_id: dto.course_id,
        chapter_id: dto.chapter_id,
      },
      order: { created_at: 'DESC' },
    });

    if (
      existing &&
      (existing.status === 'completed' || existing.status === 'completed_local')
    ) {
      isRegeneration = true;
      previousJobId = existing.id;
    }

    const job = this.videoJobRepo.create({
      institution_id: dto.institution_id ?? null,
      course_id: dto.course_id,
      chapter_id: dto.chapter_id,
      title: dto.title,
      content_txt: dto.content_txt,
      language: dto.language ?? 'es',
      target_duration_minutes: dto.target_duration_minutes ?? 10,
      visual_style: dto.visual_style ?? 'notebooklm',
      dry_run: dto.dry_run ?? false,
      brand_logo_url: dto.brand?.logo_url ?? null,
      brand_primary_color: dto.brand?.primary_color ?? '#003366',
      brand_secondary_color: dto.brand?.secondary_color ?? '#00AEEF',
      brand_institution_name: dto.brand?.institution_name ?? null,
      brand_voice_id: dto.brand?.voice_id ?? null,
      youtube_privacy: dto.youtube?.privacy_status ?? 'unlisted',
      youtube_title: dto.youtube?.title ?? null,
      youtube_description: dto.youtube?.description ?? null,
      callback_url: dto.callback_url ?? null,
      source_system: dto.source_system ?? null,
      client_reference_id: dto.client_reference_id ?? null,
      batch_id: dto.batch_id ?? null,
      batch_reference_id: dto.batch_reference_id ?? null,
      external_metadata: dto.external_metadata ?? null,
      status: 'queued',
      progress: 0,
      completed_steps: [],
    });

    const saved = await this.videoJobRepo.save(job);
    this.logger.log(`[VideosService] [${saved.id}] Job creado — ${dto.title}`);

    return { job: saved, isRegeneration, previousJobId };
  }

  async findById(id: string): Promise<VideoJob> {
    const job = await this.videoJobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} no encontrado`);
    return job;
  }

  async findByBatchId(institutionId: string, batchId: string): Promise<VideoJob[]> {
    return this.videoJobRepo.find({
      where: { institution_id: institutionId, batch_id: batchId },
      order: { created_at: 'ASC' },
    });
  }

  async getStatus(id: string): Promise<VideoStatusResponse> {
    const job = await this.findById(id);

    return {
      job_id: job.id,
      status: job.status,
      progress: job.progress,
      current_step: job.current_step,
      step_label: STEP_LABELS[job.current_step ?? ''] ?? null,
      completed_steps: job.completed_steps,
      dry_run: job.dry_run,
      local_mp4_available: job.local_mp4_available,
      youtube_url: job.youtube_url,
      embed_url: job.embed_url,
      duration_seconds: job.duration_seconds,
      scenes_count: job.scenes_count,
      thumbnail_url: job.thumbnail_url,
      error: job.error_message,
      retry_count: job.retry_count,
      created_at: job.created_at,
      updated_at: job.updated_at,
    };
  }

  async updateProgress(
    id: string,
    step: string,
    progress: number,
  ): Promise<void> {
    await this.videoJobRepo.update(id, {
      current_step: step,
      progress,
      status: 'processing',
    });
  }

  async markStepCompleted(id: string, step: string): Promise<void> {
    const job = await this.findById(id);
    const completed = [...(job.completed_steps ?? [])];
    if (!completed.includes(step)) completed.push(step);
    await this.videoJobRepo.update(id, { completed_steps: completed });
  }

  async markCompleted(
    id: string,
    data: {
      status: VideoStatus;
      localMp4Available?: boolean;
      localMp4Path?: string;
      durationSeconds?: number;
      scenesCount?: number;
      thumbnailUrl?: string;
      youtubeUrl?: string;
      embedUrl?: string;
      youtubeVideoId?: string;
    },
  ): Promise<void> {
    await this.videoJobRepo.update(id, {
      status: data.status,
      progress: 100,
      current_step: data.status as string,
      local_mp4_available: data.localMp4Available ?? false,
      local_mp4_path: data.localMp4Path ?? null,
      duration_seconds: data.durationSeconds ?? null,
      scenes_count: data.scenesCount ?? null,
      thumbnail_url: data.thumbnailUrl ?? null,
      youtube_url: data.youtubeUrl ?? null,
      embed_url: data.embedUrl ?? null,
      youtube_video_id: data.youtubeVideoId ?? null,
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    const job = await this.findById(id);
    await this.videoJobRepo.update(id, {
      status: 'failed',
      error_message: errorMessage,
      retry_count: (job.retry_count ?? 0) + 1,
    });
  }

  async retry(id: string): Promise<{ resumingFrom: string; retryCount: number }> {
    const job = await this.findById(id);

    if (job.status !== 'failed') {
      throw new BadRequestException(
        `Solo se puede reintentar un job con status 'failed'. Estado actual: ${job.status}`,
      );
    }

    const completedSteps = job.completed_steps ?? [];
    const allSteps = [
      'analyzing_content',
      'generating_script',
      'generating_scenes',
      'generating_images',
      'generating_slides',
      'generating_audio',
      'rendering_video',
      'uploading_youtube',
    ];

    const resumingFrom =
      allSteps.find((s) => !completedSteps.includes(s)) ?? 'analyzing_content';

    await this.videoJobRepo.update(id, {
      status: 'queued',
      error_message: null,
      current_step: null,
      progress: job.progress,
    });

    return { resumingFrom, retryCount: job.retry_count };
  }

  async deleteJob(id: string): Promise<void> {
    const job = await this.findById(id);

    if (job.status === 'queued' || job.status === 'processing') {
      throw new BadRequestException(
        'No se puede eliminar un job que está en proceso.',
      );
    }

    if (job.local_mp4_path && fs.existsSync(job.local_mp4_path)) {
      try {
        fs.rmSync(job.local_mp4_path, { force: true });
      } catch {
        this.logger.warn(`[deleteJob] [${id}] No se pudo eliminar el archivo MP4`);
      }
    }

    await this.videoSceneRepo.delete({ video_job_id: id });
    await this.usageLogRepo.delete({ video_job_id: id });
    await this.videoJobRepo.delete(id);

    this.logger.log(`[VideosService] [${id}] Job eliminado`);
  }

  async findAll(params: {
    institutionId?: string;
    status?: string;
    courseId?: string;
    chapterId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ jobs: VideoJob[]; total: number }> {
    const { institutionId, status, courseId, chapterId, page = 1, limit = 20 } = params;
    const qb = this.videoJobRepo.createQueryBuilder('job');

    if (institutionId) qb.andWhere('job.institution_id = :institutionId', { institutionId });
    if (status) qb.andWhere('job.status = :status', { status });
    if (courseId) qb.andWhere('job.course_id = :courseId', { courseId });
    if (chapterId) qb.andWhere('job.chapter_id = :chapterId', { chapterId });

    qb.orderBy('job.created_at', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [jobs, total] = await qb.getManyAndCount();
    return { jobs, total };
  }

  async saveScenes(
    jobId: string,
    scenes: SceneInsertData[],
  ): Promise<VideoScene[]> {
    const result = await this.videoSceneRepo
      .createQueryBuilder()
      .insert()
      .into(VideoScene)
      .values(scenes.map((s) => ({ ...s, video_job_id: jobId })))
      .execute();
    return this.videoSceneRepo.findBy(
      result.identifiers.map((r) => ({ id: r['id'] as string })),
    );
  }

  async getScenes(jobId: string): Promise<VideoScene[]> {
    return this.videoSceneRepo.find({
      where: { video_job_id: jobId },
      order: { scene_order: 'ASC' },
    });
  }

  async updateScene(
    sceneId: string,
    data: Omit<Partial<VideoScene>, 'video_job'>,
  ): Promise<void> {
    await this.videoSceneRepo.update(sceneId, data as Parameters<typeof this.videoSceneRepo.update>[1]);
  }

  async logApiUsage(data: {
    videoJobId: string;
    institutionId: string | null;
    provider: ApiProvider;
    operation: string;
    inputUnits?: number;
    outputUnits?: number;
    estimatedCost?: number;
    modelName?: string;
    unitType?: string;
    metadata?: object;
  }): Promise<void> {
    const log = this.usageLogRepo.create({
      video_job_id: data.videoJobId,
      institution_id: data.institutionId,
      provider: data.provider,
      operation: data.operation,
      input_units: data.inputUnits ?? null,
      output_units: data.outputUnits ?? null,
      estimated_cost: data.estimatedCost ?? null,
      model_name: data.modelName ?? null,
      unit_type: data.unitType ?? null,
      metadata: data.metadata ?? null,
    });
    await this.usageLogRepo.save(log);
  }

  async getUsageLogs(jobId: string): Promise<ApiUsageLog[]> {
    return this.usageLogRepo.find({ where: { video_job_id: jobId } });
  }
}
