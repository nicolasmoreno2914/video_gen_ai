import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { VideosService } from './videos.service';
import { VIDEO_QUEUE } from '../queue/queue.constants';

@Controller('dev')
export class DevController {
  constructor(
    private readonly videosService: VideosService,
    @InjectQueue(VIDEO_QUEUE) private readonly videoQueue: Queue,
  ) {}

  @Post('test-create')
  async testCreate(@Body() body: Record<string, unknown>): Promise<unknown> {
    const { job } = await this.videosService.create({
      course_id: (body['course_id'] as string) ?? 'test-course',
      chapter_id: (body['chapter_id'] as string) ?? 'test-chapter',
      title: (body['title'] as string) ?? 'Capítulo de Prueba',
      content_txt:
        (body['content_txt'] as string) ??
        'Este es un texto de prueba para generar un video educativo. El contenido educativo será expandido por la IA para crear un video de alta calidad.',
      institution_id: (body['institution_id'] as string) ?? '00000000-0000-0000-0000-000000000001',
      brand: {
        institution_name: 'Institución Demo',
        primary_color: '#003366',
        secondary_color: '#00AEEF',
      },
      dry_run: false,
    });

    await this.videoQueue.add(
      'process-video',
      { jobId: job.id },
      { jobId: job.id, attempts: 1 },
    );

    return { success: true, job_id: job.id, status: job.status };
  }

  @Post('test-create-dry-run')
  async testCreateDryRun(@Body() body: Record<string, unknown>): Promise<unknown> {
    const { job } = await this.videosService.create({
      course_id: (body['course_id'] as string) ?? 'test-course',
      chapter_id: (body['chapter_id'] as string) ?? `chapter-${Date.now()}`,
      title: (body['title'] as string) ?? 'Capítulo de Prueba — Dry Run',
      content_txt:
        (body['content_txt'] as string) ??
        'Este es un texto de prueba. La IA expandirá este contenido automáticamente para generar un guion y slides completos sin audio ni video.',
      institution_id: '00000000-0000-0000-0000-000000000001',
      brand: {
        institution_name: 'Institución Demo',
        primary_color: '#003366',
        secondary_color: '#00AEEF',
      },
      dry_run: true,
    });

    await this.videoQueue.add(
      'process-video',
      { jobId: job.id },
      { jobId: job.id, attempts: 1 },
    );

    return {
      success: true,
      job_id: job.id,
      status: job.status,
      dry_run: true,
      message: 'Dry-run encolado. Ejecutará pasos 1-5 sin audio, video ni YouTube.',
    };
  }

  @Get('jobs')
  async listJobs(): Promise<unknown> {
    const { jobs, total } = await this.videosService.findAll({ page: 1, limit: 50 });
    return { total, jobs };
  }

  @Get('jobs/:jobId/script')
  async getScript(@Param('jobId') jobId: string): Promise<unknown> {
    const job = await this.videosService.findById(jobId);
    return {
      job_id: job.id,
      title: job.title,
      status: job.status,
      generated_script: job.generated_script,
      scenes_count: job.scenes_count,
    };
  }

  @Post('mock-orbia-webhook')
  mockWebhook(@Body() body: Record<string, unknown>): unknown {
    return {
      received: true,
      timestamp: new Date().toISOString(),
      payload: body,
      message: 'Mock Orbia webhook endpoint — datos recibidos correctamente',
    };
  }

  @Get('mock-orbia-webhook')
  mockWebhookGet(): unknown {
    return {
      status: 'ready',
      message: 'Mock Orbia webhook activo. Usa POST para enviar datos.',
    };
  }
}
