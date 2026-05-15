import { Injectable, Logger, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { CursiaBatch } from '../entities/cursia-batch.entity';
import { CursiaItem } from '../entities/cursia-item.entity';
import { CreateBatchDto } from '../dto/create-batch.dto';
import { CursiaCallbackService } from './cursia-callback.service';

const TEST_FILE_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';
const TEST_FILE_SIZE = 788493;
const TEST_DURATION = 10;
const FILE_TTL_SECONDS = 10_800; // 3 hours

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
      const items = await this.itemRepo.find({ where: { batch_id: existing.id }, order: { chapter_number: 'ASC' } });
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
      void this.processTestBatch(batch, items, dto);
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

  private async processTestBatch(batch: CursiaBatch, items: CursiaItem[], dto: CreateBatchDto): Promise<void> {
    this.logger.log(`[TEST MODE] Processing batch ${batch.id} with ${items.length} items`);
    await this.batchRepo.update(batch.id, { status: 'processing' });

    for (const item of items) {
      await new Promise(r => setTimeout(r, 500)); // small delay to simulate processing

      const expiresAt = new Date(Date.now() + FILE_TTL_SECONDS * 1000);
      await this.itemRepo.update(item.id, {
        status: 'generated',
        file_url: TEST_FILE_URL,
        file_expires_at: expiresAt,
        file_size_bytes: TEST_FILE_SIZE,
        duration_seconds: TEST_DURATION,
        checksum_sha256: 'test_checksum_not_real',
      });

      void this.callbackService.send(batch.callback_url, {
        event: 'video.generated',
        batch_id: batch.id,
        item_id: item.id,
        request_id: batch.request_id,
        chapter_number: item.chapter_number,
        status: 'generated',
        file_url: TEST_FILE_URL,
        expires_at: expiresAt.toISOString(),
        size_bytes: TEST_FILE_SIZE,
        duration_seconds: TEST_DURATION,
        checksum_sha256: 'test_checksum_not_real',
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

  private async processProductionBatch(batch: CursiaBatch, items: CursiaItem[], dto: CreateBatchDto): Promise<void> {
    this.logger.log(`[PRODUCTION] Queueing batch ${batch.id} — ${items.length} videos`);
    // Import VideosService dynamically to avoid circular deps — use event emitter instead
    // Each CursiaItem needs a VideoJob created via the existing VideosService
    // For now, log that production mode requires VideosService integration
    // TODO: inject VideosService and create a job per item, store video_job_id on item
    this.logger.warn(`Production batch processing not yet wired to VideoProcessor. Batch ${batch.id} remains in queued state.`);
  }

  @OnEvent('cursia.job.completed')
  async onJobCompleted(event: { jobId: string; localMp4Path?: string; downloadUrl?: string; durationSeconds?: number }): Promise<void> {
    const item = await this.itemRepo.findOne({ where: { video_job_id: event.jobId } });
    if (!item) return;

    const batch = await this.batchRepo.findOne({ where: { id: item.batch_id } });
    if (!batch) return;

    const expiresAt = new Date(Date.now() + FILE_TTL_SECONDS * 1000);
    const fileUrl = event.downloadUrl ?? null;

    await this.itemRepo.update(item.id, {
      status: 'generated',
      file_url: fileUrl,
      file_expires_at: expiresAt,
      duration_seconds: event.durationSeconds ?? null,
    });

    if (fileUrl) {
      void this.callbackService.send(batch.callback_url, {
        event: 'video.generated',
        batch_id: batch.id,
        item_id: item.id,
        request_id: batch.request_id,
        chapter_number: item.chapter_number,
        status: 'generated',
        file_url: fileUrl,
        expires_at: expiresAt.toISOString(),
        size_bytes: null,
        duration_seconds: event.durationSeconds ?? null,
        checksum_sha256: null,
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

  private async checkBatchCompletion(batchId: string): Promise<void> {
    const items = await this.itemRepo.find({ where: { batch_id: batchId } });
    const total = items.length;
    const completed = items.filter(i => i.status === 'generated').length;
    const failed = items.filter(i => i.status === 'failed').length;
    const done = completed + failed;

    if (done < total) {
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
        file_url: i.file_url,
        expires_at: i.file_expires_at?.toISOString() ?? null,
        size_bytes: i.file_size_bytes,
        duration_seconds: i.duration_seconds,
        error: i.error,
      })),
    };
  }
}
