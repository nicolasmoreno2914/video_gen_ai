import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import { ExternalApiKeyGuard, ExternalRequest } from '../../common/guards/external-api-key.guard';
import { VideosService } from '../videos/videos.service';
import { VIDEO_QUEUE } from '../queue/queue.constants';
import { STEP_LABELS } from '../../common/types';

import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Max,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

class ExternalCreateVideoDto {
  @IsOptional()
  @IsBoolean()
  test_only?: boolean;

  @IsOptional()
  @IsString()
  course_id?: string;

  @IsOptional()
  @IsString()
  chapter_id?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content_txt?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(30)
  target_duration_minutes?: number;

  @IsOptional()
  @IsString()
  visual_style?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  callback_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source_system?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  client_reference_id?: string;

  @IsOptional()
  @IsUUID()
  batch_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  batch_reference_id?: string;

  @IsOptional()
  @IsObject()
  external_metadata?: Record<string, unknown>;
}

class BatchVideoItemDto {
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsString()
  content_txt!: string;

  @IsOptional()
  @IsString()
  course_id?: string;

  @IsOptional()
  @IsString()
  chapter_id?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(30)
  target_duration_minutes?: number;

  @IsOptional()
  @IsString()
  visual_style?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  callback_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  client_reference_id?: string;

  @IsOptional()
  @IsObject()
  external_metadata?: Record<string, unknown>;
}

class ExternalBatchCreateDto {
  @IsOptional()
  @IsBoolean()
  test_only?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source_system?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  batch_reference_id?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => BatchVideoItemDto)
  videos!: BatchVideoItemDto[];
}

@Controller('external')
@UseGuards(ExternalApiKeyGuard)
export class ExternalController {
  constructor(
    private readonly videosService: VideosService,
    @InjectQueue(VIDEO_QUEUE) private readonly videoQueue: Queue,
  ) {}

  @Get('auth-test')
  authTest(@Req() req: ExternalRequest) {
    return {
      success: true,
      auth_type: req.auth_type,
      institution_id: req.institution_id,
      institution_name: req.institution.name,
      message: 'API key is valid.',
    };
  }

  @Post('videos/create')
  async createVideo(
    @Req() req: ExternalRequest,
    @Body() body: ExternalCreateVideoDto,
    @Res() res: Response,
  ): Promise<void> {
    const missing = (['title', 'content_txt'] as const).filter((f) => !body[f]);
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required fields: ${missing.join(', ')}`);
    }

    if (body.test_only) {
      res.status(HttpStatus.OK).json({
        success: true,
        test_only: true,
        message: 'Request validated successfully. No video was generated.',
        institution_id: req.institution_id,
        institution_name: req.institution.name,
        title: body.title,
        source_system: body.source_system ?? null,
        client_reference_id: body.client_reference_id ?? null,
      });
      return;
    }

    const { job } = await this.videosService.create({
      institution_id: req.institution_id,
      course_id: body.course_id ?? '',
      chapter_id: body.chapter_id ?? '',
      title: body.title!,
      content_txt: body.content_txt!,
      language: body.language ?? 'es',
      target_duration_minutes: body.target_duration_minutes ?? 7,
      visual_style: body.visual_style ?? 'notebooklm',
      callback_url: body.callback_url ?? undefined,
      source_system: body.source_system ?? undefined,
      client_reference_id: body.client_reference_id ?? undefined,
      batch_id: body.batch_id ?? undefined,
      batch_reference_id: body.batch_reference_id ?? undefined,
      external_metadata: body.external_metadata ?? undefined,
    });

    await this.videoQueue.add(
      'process-video',
      { jobId: job.id },
      {
        jobId: job.id,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    res.status(HttpStatus.OK).json({
      success: true,
      job_id: job.id,
      status: job.status,
      institution_id: req.institution_id,
      source_system: job.source_system,
      client_reference_id: job.client_reference_id,
    });
  }

  @Post('videos/batch-create')
  async batchCreateVideos(
    @Req() req: ExternalRequest,
    @Body() body: ExternalBatchCreateDto,
    @Res() res: Response,
  ): Promise<void> {
    const batchId = randomUUID();

    if (body.test_only) {
      res.status(HttpStatus.OK).json({
        success: true,
        test_only: true,
        message: 'Batch request validated successfully. No videos were generated.',
        institution_id: req.institution_id,
        institution_name: req.institution.name,
        batch_id: batchId,
        source_system: body.source_system ?? null,
        batch_reference_id: body.batch_reference_id ?? null,
        video_count: body.videos.length,
        videos: body.videos.map((v, i) => ({
          index: i,
          title: v.title,
          client_reference_id: v.client_reference_id ?? null,
        })),
      });
      return;
    }

    const created: Array<{ index: number; job_id: string; title: string; client_reference_id: string | null }> = [];

    for (let i = 0; i < body.videos.length; i++) {
      const v = body.videos[i];
      const { job } = await this.videosService.create({
        institution_id: req.institution_id,
        course_id: v.course_id ?? '',
        chapter_id: v.chapter_id ?? '',
        title: v.title,
        content_txt: v.content_txt,
        language: v.language ?? 'es',
        target_duration_minutes: v.target_duration_minutes ?? 7,
        visual_style: v.visual_style ?? 'notebooklm',
        callback_url: v.callback_url ?? undefined,
        source_system: body.source_system ?? undefined,
        client_reference_id: v.client_reference_id ?? undefined,
        batch_id: batchId,
        batch_reference_id: body.batch_reference_id ?? undefined,
        external_metadata: v.external_metadata ?? undefined,
      });

      await this.videoQueue.add(
        'process-video',
        { jobId: job.id },
        {
          jobId: job.id,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      created.push({
        index: i,
        job_id: job.id,
        title: v.title,
        client_reference_id: v.client_reference_id ?? null,
      });
    }

    res.status(HttpStatus.OK).json({
      success: true,
      batch_id: batchId,
      source_system: body.source_system ?? null,
      batch_reference_id: body.batch_reference_id ?? null,
      institution_id: req.institution_id,
      video_count: created.length,
      videos: created,
    });
  }

  @Get('videos/batches/:batchId/status')
  async getBatchStatus(
    @Req() req: ExternalRequest,
    @Param('batchId') batchId: string,
  ) {
    const jobs = await this.videosService.findByBatchId(req.institution_id, batchId);

    if (jobs.length === 0) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const summary = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    const videos = jobs.map((job) => {
      const s = job.status;
      if (s === 'completed' || s === 'completed_local') summary.completed++;
      else if (s === 'failed') summary.failed++;
      else if (s === 'processing') summary.processing++;
      else summary.queued++;

      return {
        job_id: job.id,
        title: job.title,
        status: job.status,
        progress: job.progress,
        current_step: job.current_step,
        step_label: STEP_LABELS[job.current_step ?? ''] ?? null,
        youtube_url: job.youtube_url,
        error: job.error_message,
        client_reference_id: job.client_reference_id,
        source_system: job.source_system,
        created_at: job.created_at,
        updated_at: job.updated_at,
      };
    });

    const allDone = summary.completed + summary.failed === jobs.length;
    const batchStatus = summary.failed === jobs.length
      ? 'failed'
      : allDone
        ? 'completed'
        : summary.processing > 0 || summary.completed > 0 || summary.failed > 0
          ? 'processing'
          : 'queued';

    return {
      batch_id: batchId,
      batch_reference_id: jobs[0].batch_reference_id,
      source_system: jobs[0].source_system,
      institution_id: req.institution_id,
      status: batchStatus,
      video_count: jobs.length,
      summary,
      videos,
    };
  }

  @Get('videos/:jobId/status')
  async getVideoStatus(
    @Req() req: ExternalRequest,
    @Param('jobId') jobId: string,
  ) {
    const job = await this.videosService.findById(jobId);

    if (job.institution_id !== req.institution_id) {
      throw new NotFoundException('Job not found');
    }

    const status = await this.videosService.getStatus(jobId);

    return {
      job_id: status.job_id,
      status: status.status,
      progress: status.progress,
      current_step: status.current_step,
      step_label: STEP_LABELS[status.current_step ?? ''] ?? null,
      youtube_url: status.youtube_url,
      download_url: status.local_mp4_available
        ? `${req.protocol}://${req.get('host')}/api/videos/${jobId}/download`
        : null,
      duration_seconds: status.duration_seconds,
      error: status.error,
      source_system: job.source_system,
      client_reference_id: job.client_reference_id,
      batch_id: job.batch_id,
    };
  }
}
