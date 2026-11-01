import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Interval } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { VideosService } from '../videos/videos.service';
import { ProgressEventsService } from '../events/progress.events';
import { WebhookService } from '../webhook/webhook.service';
import { STEP_LABELS } from '../../common/types';
import { AUTO_RETRY_DELAYS_MIN, classifyFailure } from './failure';
import { VIDEO_QUEUE, enqueueVideo, processesJobs, readPauseRecord, writePauseRecord } from './queue.constants';

/** Espera (min) antes de reanudar la cola tras la 1.ª, 2.ª y 3.ª+ pausa seguida. */
const PAUSE_MINUTES = (process.env.QUEUE_PAUSE_MINUTES ?? '10,30,60').split(',').map(Number).filter((n) => n > 0);

/**
 * Qué hacer cuando un video falla, y los dos relojes que evitan que algo quede trabado:
 * reanudar la cola pausada y retomar videos interrumpidos o perdidos.
 */
@Injectable()
export class VideoRecoveryService {
  private readonly logger = new Logger(VideoRecoveryService.name);

  constructor(
    @InjectQueue(VIDEO_QUEUE) private readonly queue: Queue,
    private readonly videosService: VideosService,
    private readonly eventsService: ProgressEventsService,
    private readonly webhookService: WebhookService,
  ) {}

  /** Error en un video: reintento automático, pausa de la cola o "requiere atención". */
  async handleFailure(jobId: string, err: unknown): Promise<void> {
    const failure = classifyFailure(err);
    const job = await this.videosService.findById(jobId);
    const step = job.current_step;
    const stepLabel = STEP_LABELS[step ?? ''] ?? step ?? 'inicio';

    if (failure.kind === 'global') {
      this.logger.error(`[Recovery] [${jobId}] Problema general en "${stepLabel}": ${failure.detail}`);
      await this.videosService.markWaitingForQueue(jobId, failure.detail);
      await this.pause(failure.reason);
      // Queda en la cola pausada y sigue desde su último paso cuando se reanude
      await enqueueVideo(this.queue, jobId, `resume-${Date.now()}`);
      return;
    }

    const done = job.auto_retry_count ?? 0;
    if (failure.kind === 'transient' && done < AUTO_RETRY_DELAYS_MIN.length) {
      const minutes = AUTO_RETRY_DELAYS_MIN[done]!;
      const n = await this.videosService.scheduleAutoRetry(jobId, new Date(Date.now() + minutes * 60_000), failure.detail);
      await enqueueVideo(this.queue, jobId, `auto-${n}-${Date.now()}`, minutes * 60_000);
      this.logger.warn(
        `[Recovery] [${jobId}] Error en "${stepLabel}" — reintento automático ${n}/${AUTO_RETRY_DELAYS_MIN.length} ` +
        `en ${minutes} min: ${failure.detail}`,
      );
      this.eventsService.emitProgress(await this.videosService.findById(jobId));
      return;
    }

    const message = failure.kind === 'transient'
      ? `${failure.reason} Paso: ${stepLabel}. Último error: ${failure.detail}`
      : `${failure.reason} (${failure.detail})`;
    this.logger.error(`[Recovery] [${jobId}] Requiere atención: ${message}`);
    await this.videosService.markFailed(jobId, message.substring(0, 1000), failure.kind);
    const failed = await this.videosService.findById(jobId);
    this.eventsService.emitFailed(failed, step);
    await this.webhookService.sendFailure(failed, step);
  }

  /** Pausa la cola por un problema general; se reanuda sola (ver resumeWhenDue). */
  async pause(reason: string): Promise<void> {
    if (await this.queue.isPaused()) return; // otro video ya la pausó por lo mismo
    const prev = await readPauseRecord(this.queue);
    const level = (prev?.level ?? 0) + 1;
    const minutes = PAUSE_MINUTES[Math.min(level, PAUSE_MINUTES.length) - 1]!;
    await this.queue.pause();
    await writePauseRecord(this.queue, {
      reason,
      since: new Date().toISOString(),
      resume_at: new Date(Date.now() + minutes * 60_000).toISOString(),
      level,
    });
    this.logger.error(`[Recovery] Cola PAUSADA (${minutes} min): ${reason}`);
  }

  async resume(): Promise<void> {
    await this.queue.resume();
    this.logger.log('[Recovery] Cola reanudada');
  }

  /** Un video terminó bien: el problema general (si lo hubo) está resuelto. */
  async markHealthy(): Promise<void> {
    if (await readPauseRecord(this.queue)) await writePauseRecord(this.queue, null);
  }

  @Interval(60_000)
  async resumeWhenDue(): Promise<void> {
    if (!processesJobs()) return;
    try {
      const record = await readPauseRecord(this.queue);
      if (!record || !(await this.queue.isPaused())) return;
      if (Date.now() >= Date.parse(record.resume_at)) {
        this.logger.log(`[Recovery] Reanudando la cola tras la pausa (${record.reason})`);
        await this.resume();
      }
    } catch (err: unknown) {
      this.logger.warn(`[Recovery] No se pudo revisar la pausa: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Vigilante: videos cuyo worker dejó de latir (reinicio, cuelgue) y videos en cola que no están
   * en Redis (p. ej. si se vació). Ninguno se queda trabado para siempre.
   */
  @Interval(5 * 60_000)
  async watchdog(): Promise<void> {
    if (!processesJobs()) return;
    try {
      for (const job of await this.videosService.findStalled()) {
        this.logger.warn(`[Recovery] [${job.id}] Sin latido en "${job.current_step}" — se retoma`);
        await this.handleFailure(job.id, new Error('El proceso se interrumpió a mitad del video (reinicio o cuelgue del worker)'));
      }

      const overdue = await this.videosService.findOverdueQueued();
      if (!overdue.length) return;
      const inRedis = new Set(
        (await this.queue.getJobs(['waiting', 'delayed', 'active', 'paused', 'prioritized']))
          .map((j) => (j?.data as { jobId?: string } | undefined)?.jobId),
      );
      for (const job of overdue.filter((j) => !inRedis.has(j.id))) {
        this.logger.warn(`[Recovery] [${job.id}] En cola pero no en Redis — se vuelve a encolar`);
        await enqueueVideo(this.queue, job.id, `wd-${Date.now()}`);
      }
    } catch (err: unknown) {
      this.logger.warn(`[Recovery] Vigilante falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
