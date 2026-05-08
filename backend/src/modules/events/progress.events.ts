import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Subject } from 'rxjs';
import {
  VideoProgressEvent,
  VideoCompletedEvent,
  VideoFailedEvent,
  STEP_LABELS,
} from '../../common/types';
import { VideoJob } from '../database/entities/video-job.entity';

@Injectable()
export class ProgressEventsService {
  private readonly logger = new Logger(ProgressEventsService.name);
  private readonly subjects = new Map<string, Subject<string>>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  getOrCreateSubject(jobId: string): Subject<string> {
    if (!this.subjects.has(jobId)) {
      this.subjects.set(jobId, new Subject<string>());
    }
    return this.subjects.get(jobId)!;
  }

  removeSubject(jobId: string): void {
    const subject = this.subjects.get(jobId);
    if (subject) {
      subject.complete();
      this.subjects.delete(jobId);
    }
  }

  emitProgress(job: VideoJob): void {
    const event: VideoProgressEvent = {
      job_id: job.id,
      progress: job.progress,
      current_step: job.current_step ?? '',
      step_label: STEP_LABELS[job.current_step ?? ''] ?? '',
      status: job.status,
    };

    const payload = `event: progress\ndata: ${JSON.stringify(event)}\n\n`;
    this.subjects.get(job.id)?.next(payload);
    this.eventEmitter.emit('video.progress', event);

    this.logger.log(
      `[ProgressEventsService] [${job.id}] ${job.current_step} ${job.progress}%`,
    );
  }

  emitCompleted(job: VideoJob, host: string): void {
    const downloadUrl = job.local_mp4_available
      ? `${host}/api/videos/${job.id}/download`
      : null;

    const event: VideoCompletedEvent = {
      job_id: job.id,
      status: job.status,
      progress: 100,
      local_mp4_available: job.local_mp4_available,
      download_url: downloadUrl,
      youtube_url: job.youtube_url,
      duration_seconds: job.duration_seconds,
      scenes_count: job.scenes_count,
      thumbnail_url: job.thumbnail_url,
    };

    const payload = `event: completed\ndata: ${JSON.stringify(event)}\n\n`;
    this.subjects.get(job.id)?.next(payload);
    this.eventEmitter.emit('video.completed', event);

    setTimeout(() => this.removeSubject(job.id), 10000);

    this.logger.log(`[ProgressEventsService] [${job.id}] COMPLETADO`);
  }

  emitFailed(job: VideoJob, failedStep: string | null): void {
    const event: VideoFailedEvent = {
      job_id: job.id,
      status: 'failed',
      error: job.error_message ?? 'Error desconocido en el procesamiento del video',
      failed_step: failedStep,
      can_retry: job.retry_count < 3,
    };

    const payload = `event: failed\ndata: ${JSON.stringify(event)}\n\n`;
    this.subjects.get(job.id)?.next(payload);
    this.eventEmitter.emit('video.failed', event);

    setTimeout(() => this.removeSubject(job.id), 10000);

    this.logger.error(`[ProgressEventsService] [${job.id}] FALLIDO en paso: ${failedStep}`);
  }
}
