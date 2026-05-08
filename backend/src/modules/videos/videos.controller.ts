import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { VideosService } from './videos.service';
import { InstitutionsService } from '../institutions/institutions.service';
import { ProgressEventsService } from '../events/progress.events';
import { DualAuthGuard } from '../../common/guards/dual-auth.guard';
import { CreateVideoDto } from './dto/create-video.dto';
import { CreateVideoResponse, VideoStatusResponse } from './dto/video-status.dto';
import { VIDEO_QUEUE } from '../queue/queue.constants';
import { STEP_LABELS } from '../../common/types';
import * as fs from 'fs';

@Controller('videos')
export class VideosController {
  constructor(
    private readonly videosService: VideosService,
    private readonly institutionsService: InstitutionsService,
    private readonly progressEventsService: ProgressEventsService,
    @InjectQueue(VIDEO_QUEUE) private readonly videoQueue: Queue,
  ) {}

  @Post('create')
  @UseGuards(DualAuthGuard)
  async create(
    @Body() dto: CreateVideoDto,
    @Res() res: Response,
  ): Promise<void> {
    if (dto.institution_id) {
      const { allowed, used, limit } =
        await this.institutionsService.checkRateLimit(dto.institution_id);

      if (!allowed) {
        res.status(HttpStatus.TOO_MANY_REQUESTS).json({
          success: false,
          error: 'daily_limit_exceeded',
          message: `Límite diario de ${limit} videos alcanzado. Se reinicia a las 00:00.`,
          limit,
          used_today: used,
        });
        return;
      }
    }

    const { job, isRegeneration, previousJobId } =
      await this.videosService.create(dto);

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

    const response: CreateVideoResponse = {
      success: true,
      job_id: job.id,
      status: job.status,
      is_regeneration: isRegeneration,
      previous_job_id: previousJobId,
      dry_run: job.dry_run,
    };

    res.status(HttpStatus.OK).json(response);
  }

  @Get(':jobId/status')
  @UseGuards(DualAuthGuard)
  getStatus(@Param('jobId') jobId: string): Promise<VideoStatusResponse> {
    return this.videosService.getStatus(jobId);
  }

  @Get(':jobId/progress-stream')
  progressStream(
    @Param('jobId') jobId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(': connected\n\n');

    const subject = this.progressEventsService.getOrCreateSubject(jobId);
    const subscription = subject.subscribe({
      next: (data) => res.write(data),
      error: () => res.end(),
      complete: () => res.end(),
    });

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
    });

    this.videosService.getStatus(jobId).then((status) => {
      if (
        status.status === 'completed' ||
        status.status === 'completed_local' ||
        status.status === 'dry_run_completed' ||
        status.status === 'failed'
      ) {
        const eventType =
          status.status === 'failed' ? 'failed' : 'completed';
        res.write(`event: ${eventType}\ndata: ${JSON.stringify(status)}\n\n`);
        clearInterval(heartbeat);
        subscription.unsubscribe();
        res.end();
      }
    }).catch(() => {
      res.end();
    });
  }

  @Get(':jobId/download')
  async download(
    @Param('jobId') jobId: string,
    @Res() res: Response,
  ): Promise<void> {
    const job = await this.videosService.findById(jobId);

    if (!job.local_mp4_available || !job.local_mp4_path) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: 'video_not_available',
        message: 'El video no está disponible para descarga aún.',
      });
      return;
    }

    // R2 storage: local_mp4_path is a public URL — redirect instead of streaming
    if (job.local_mp4_path.startsWith('https://')) {
      res.redirect(302, job.local_mp4_path);
      return;
    }

    if (!fs.existsSync(job.local_mp4_path)) {
      res.status(HttpStatus.GONE).json({
        success: false,
        error: 'video_expired',
        message: 'El archivo de video ha expirado o fue eliminado.',
      });
      return;
    }

    const safeName = job.title.replace(/[^a-z0-9\-_\s]/gi, '').replace(/\s+/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.mp4"`);
    res.setHeader('Content-Type', 'video/mp4');

    const stream = fs.createReadStream(job.local_mp4_path);
    stream.pipe(res);

    await this.videosService['videoJobRepo'].update(jobId, {
      downloaded_at: new Date(),
    });
  }

  @Post(':jobId/retry')
  @UseGuards(DualAuthGuard)
  async retry(
    @Param('jobId') jobId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { resumingFrom, retryCount } = await this.videosService.retry(jobId);

    await this.videoQueue.add(
      'process-video',
      { jobId },
      {
        jobId: `${jobId}-retry-${retryCount}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    res.status(HttpStatus.OK).json({
      success: true,
      resuming_from: resumingFrom,
      retry_count: retryCount,
    });
  }

  @Delete(':jobId')
  @UseGuards(DualAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteJob(@Param('jobId') jobId: string) {
    await this.videosService.deleteJob(jobId);
    return { success: true, job_id: jobId };
  }

  @Get()
  @UseGuards(DualAuthGuard)
  async findAll(
    @Query('institution_id') institutionId?: string,
    @Query('status') status?: string,
    @Query('course_id') courseId?: string,
    @Query('chapter_id') chapterId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ jobs: unknown[]; total: number; page: number; limit: number }> {
    const { jobs, total } = await this.videosService.findAll({
      institutionId,
      status,
      courseId,
      chapterId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });

    const mappedJobs: VideoStatusResponse[] = jobs.map((job) => ({
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
      title: job.title,
    }));

    return {
      jobs: mappedJobs,
      total,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    };
  }
}
