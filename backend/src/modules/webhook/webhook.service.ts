import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { VideoJob } from '../database/entities/video-job.entity';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  async sendSuccess(job: VideoJob, host: string): Promise<void> {
    if (!job.callback_url) return;

    const downloadUrl = job.local_mp4_available
      ? `${host}/api/videos/${job.id}/download`
      : null;

    const payload = {
      job_id: job.id,
      course_id: job.course_id,
      chapter_id: job.chapter_id,
      institution_id: job.institution_id,
      status: job.status,
      dry_run: job.dry_run,
      local_mp4_available: job.local_mp4_available,
      download_url: downloadUrl,
      youtube_url: job.youtube_url ?? null,
      embed_url: job.embed_url ?? null,
      duration_seconds: job.duration_seconds,
      scenes_count: job.scenes_count,
      thumbnail_url: job.thumbnail_url,
      visual_style: job.visual_style,
    };

    await this.sendWithRetry(job.callback_url, payload, job.id);
  }

  async sendDryRun(job: VideoJob, guidingQuestion: string, scenesCount: number): Promise<void> {
    if (!job.callback_url) return;

    const payload = {
      job_id: job.id,
      status: 'dry_run_completed',
      dry_run: true,
      scenes_count: scenesCount,
      guiding_question: guidingQuestion,
      message: 'Dry-run completado. Guion y slides generados sin audio ni video.',
    };

    await this.sendWithRetry(job.callback_url, payload, job.id);
  }

  async sendFailure(job: VideoJob, failedStep: string | null): Promise<void> {
    if (!job.callback_url) return;

    const payload = {
      job_id: job.id,
      status: 'failed',
      error: job.error_message ?? 'Error en el procesamiento del video',
      failed_step: failedStep,
      can_retry: (job.retry_count ?? 0) < 3,
      retry_count: job.retry_count,
    };

    await this.sendWithRetry(job.callback_url, payload, job.id);
  }

  private async sendWithRetry(
    url: string,
    payload: Record<string, unknown>,
    jobId: string,
  ): Promise<void> {
    const delays = [5000, 15000, 30000];

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await axios.post(url, payload, {
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' },
        });
        this.logger.log(`[WebhookService] [${jobId}] Webhook enviado a ${url}`);
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[WebhookService] [${jobId}] Webhook intento ${attempt + 1}/3 falló: ${msg}`,
        );
        if (attempt < 2) await this.sleep(delays[attempt]!);
      }
    }

    this.logger.error(
      `[WebhookService] [${jobId}] Webhook falló después de 3 intentos — job no afectado`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
