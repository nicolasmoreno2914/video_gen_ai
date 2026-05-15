import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { CursiaBatch } from '../entities/cursia-batch.entity';
import { CursiaItem } from '../entities/cursia-item.entity';
import { CreateBatchDto } from '../dto/create-batch.dto';
import { CursiaCallbackService } from './cursia-callback.service';
import { TempStorageService } from '../../temp-storage/temp-storage.service';

function scriptHash(script: string): string {
  return crypto.createHash('sha256').update(script).digest('hex').slice(0, 16);
}

@Injectable()
export class CursiaBatchesService {
  private readonly logger = new Logger(CursiaBatchesService.name);
  private readonly testMode = process.env.VIDEOGEN_TEST_MODE === 'true';

  constructor(
    @InjectRepository(CursiaBatch)
    private readonly batchRepo: Repository<CursiaBatch>,
    @InjectRepository(CursiaItem)
    private readonly itemRepo: Repository<CursiaItem>,
    private readonly callbackService: CursiaCallbackService,
    private readonly tempStorage: TempStorageService,
  ) {}

  async createBatch(dto: CreateBatchDto): Promise<{
    success: boolean;
    batch_id: string;
    status: string;
    estimated_seconds: number;
    items: Array<{ chapter_number: number; item_id: string; status: string }>;
    duplicate_request?: boolean;
  }> {
    // Idempotency check
    const existing = await this.batchRepo.findOne({ where: { request_id: dto.request_id } });
    if (existing) {
      const items = await this.itemRepo.find({
        where: { batch_id: existing.id },
        order: { chapter_number: 'ASC' },
      });
      return {
        success: true,
        batch_id: existing.id,
        status: existing.status,
        estimated_seconds: 0,
        duplicate_request: true,
        items: items.map(i => ({ chapter_number: i.chapter_number, item_id: i.id, status: i.status })),
      };
    }

    // Create batch
    const batch = this.batchRepo.create({
      request_id: dto.request_id,
      cursia_course_id: dto.course_id ?? null,
      callback_url: dto.callback_url,
      status: 'queued',
      total_items: dto.videos.length,
      options: dto.options ? { ...dto.options } : null,
    });
    await this.batchRepo.save(batch);

    // Create items
    const items = await Promise.all(
      dto.videos.map(v =>
        this.itemRepo.save(
          this.itemRepo.create({
            batch_id: batch.id,
            chapter_number: v.chapter_number,
            title: v.title,
            script_hash: scriptHash(v.script),
            status: 'queued',
          }),
        ),
      ),
    );

    const estimatedSeconds = dto.videos.length * (this.testMode ? 2 : 180);

    // Process async (don't await)
    if (this.testMode) {
      void this.processTestBatch(batch, items);
    } else {
      void this.processProductionBatch(batch, items, dto);
    }

    return {
      success: true,
      batch_id: batch.id,
      status: 'queued',
      estimated_seconds: estimatedSeconds,
      items: items.map(i => ({ chapter_number: i.chapter_number, item_id: i.id, status: i.status })),
    };
  }

  // ─── Test mode ─────────────────────────────────────────────────────────────

  private async processTestBatch(batch: CursiaBatch, items: CursiaItem[]): Promise<void> {
    this.logger.log(`[TEST MODE] Processing batch ${batch.id} with ${items.length} items`);
    await this.batchRepo.update(batch.id, { status: 'processing' });

    for (const item of items) {
      await new Promise(r => setTimeout(r, 500)); // small delay to simulate processing

      // Register in TempStorage — generates a real signed download URL
      const stored = await this.tempStorage.storeTestEntry();

      await this.itemRepo.update(item.id, {
        status: 'generated',
        file_url: stored.download_url,
        file_expires_at: new Date(stored.expires_at),
        file_size_bytes: stored.size_bytes,
        duration_seconds: stored.duration_seconds,
        checksum_sha256: stored.checksum_sha256,
      });

      void this.callbackService.send(batch.callback_url, {
        event: 'video.generated',
        batch_id: batch.id,
        item_id: item.id,
        request_id: batch.request_id,
        chapter_number: item.chapter_number,
        status: 'generated',
        file_url: stored.download_url,
        expires_at: stored.expires_at,
        size_bytes: stored.size_bytes,
        duration_seconds: stored.duration_seconds,
        checksum_sha256: stored.checksum_sha256,
      });
    }

    await this.batchRepo.update(batch.id, {
      status: 'completed',
      completed_items: items.length,
    });

    void this.callbackService.send(batch.callback_url, {
      event: 'batch.completed',
      batch_id: batch.id,
      request_id: batch.request_id,
      status: 'completed',
      total: items.length,
      succeeded: items.length,
      failed: 0,
    });
  }

  // ─── Production mode ────────────────────────────────────────────────────────

  private async processProductionBatch(
    batch: CursiaBatch,
    items: CursiaItem[],
    _dto: CreateBatchDto,
  ): Promise<void> {
    this.logger.log(`[PRODUCTION] Batch ${batch.id} queued — ${items.length} videos`);
    // TODO: inject VideosService, create one VideoJob per CursiaItem,
    // store video_job_id on each item. VideoProcessor emits 'cursia.job.completed'
    // when each job finishes — handled below by @OnEvent listeners.
    this.logger.warn(
      `Production wiring pending. Batch ${batch.id} stays in 'queued' until VideoProcessor integration is complete.`,
    );
  }

  // ─── Event listeners (production) ──────────────────────────────────────────

  @OnEvent('cursia.job.completed')
  async onJobCompleted(event: {
    jobId: string;
    localMp4Path?: string;
    durationSeconds?: number;
  }): Promise<void> {
    const item = await this.itemRepo.findOne({ where: { video_job_id: event.jobId } });
    if (!item) return;

    const batch = await this.batchRepo.findOne({ where: { id: item.batch_id } });
    if (!batch) return;

    // Store the generated MP4 in TempStorage and get a signed download URL
    let stored: Awaited<ReturnType<TempStorageService['storeTestEntry']>> | null = null;
    if (event.localMp4Path) {
      try {
        stored = await this.tempStorage.storeFile(event.localMp4Path, event.jobId);
        if (event.durationSeconds) {
          // Patch duration (not computed in storeFile yet)
          stored = { ...stored, duration_seconds: event.durationSeconds };
        }
      } catch (err) {
        this.logger.error(`[CursiaBatches] Failed to store MP4 for job ${event.jobId}: ${(err as Error).message}`);
      }
    }

    await this.itemRepo.update(item.id, {
      status: 'generated',
      file_url: stored?.download_url ?? null,
      file_expires_at: stored ? new Date(stored.expires_at) : null,
      file_size_bytes: stored?.size_bytes ?? null,
      duration_seconds: stored?.duration_seconds ?? null,
      checksum_sha256: stored?.checksum_sha256 ?? null,
    });

    if (stored) {
      void this.callbackService.send(batch.callback_url, {
        event: 'video.generated',
        batch_id: batch.id,
        item_id: item.id,
        request_id: batch.request_id,
        chapter_number: item.chapter_number,
        status: 'generated',
        file_url: stored.download_url,
        expires_at: stored.expires_at,
        size_bytes: stored.size_bytes,
        duration_seconds: stored.duration_seconds,
        checksum_sha256: stored.checksum_sha256,
      });
    }

    await this.checkBatchCompletion(batch.id);
  }

  @OnEvent('cursia.job.failed')
  async onJobFailed(event: { jobId: string; error: string }): Promise<void> {
    const item = await this.itemRepo.findOne({ where: { video_job_id: event.jobId } });
    if (!item) return;

    const batch = await this.batchRepo.findOne({ where: { id: item.batch_id } });
    if (!batch) return;

    await this.itemRepo.update(item.id, { status: 'failed', error: event.error });

    void this.callbackService.send(batch.callback_url, {
      event: 'video.failed',
      batch_id: batch.id,
      item_id: item.id,
      request_id: batch.request_id,
      chapter_number: item.chapter_number,
      status: 'failed',
      error: event.error,
    });

    await this.checkBatchCompletion(batch.id);
  }

  // ─── Batch completion ───────────────────────────────────────────────────────

  private async checkBatchCompletion(batchId: string): Promise<void> {
    const items = await this.itemRepo.find({ where: { batch_id: batchId } });
    const total = items.length;
    const completed = items.filter(i => i.status === 'generated').length;
    const failed = items.filter(i => i.status === 'failed').length;

    if (completed + failed < total) {
      await this.batchRepo.update(batchId, { completed_items: completed, failed_items: failed, status: 'processing' });
      return;
    }

    const finalStatus = failed === 0 ? 'completed' : completed === 0 ? 'failed' : 'partial';
    await this.batchRepo.update(batchId, { status: finalStatus, completed_items: completed, failed_items: failed });

    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (!batch) return;

    void this.callbackService.send(batch.callback_url, {
      event: 'batch.completed',
      batch_id: batch.id,
      request_id: batch.request_id,
      status: finalStatus,
      total,
      succeeded: completed,
      failed,
    });
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  async getBatchById(batchId: string) {
    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (!batch) return null;
    const items = await this.itemRepo.find({ where: { batch_id: batchId }, order: { chapter_number: 'ASC' } });
    return this.formatBatchResponse(batch, items);
  }

  async getBatchByRequestId(requestId: string) {
    const batch = await this.batchRepo.findOne({ where: { request_id: requestId } });
    if (!batch) return null;
    const items = await this.itemRepo.find({ where: { batch_id: batch.id }, order: { chapter_number: 'ASC' } });
    return this.formatBatchResponse(batch, items);
  }

  private formatBatchResponse(batch: CursiaBatch, items: CursiaItem[]) {
    return {
      batch_id: batch.id,
      request_id: batch.request_id,
      status: batch.status,
      total: batch.total_items,
      completed: batch.completed_items,
      failed: batch.failed_items,
      items: items.map(i => ({
        chapter_number: i.chapter_number,
        item_id: i.id,
        status: i.status,
        download_url: i.file_url,
        expires_at: i.file_expires_at?.toISOString() ?? null,
        size_bytes: i.file_size_bytes,
        duration_seconds: i.duration_seconds,
        error: i.error,
      })),
    };
  }
}
