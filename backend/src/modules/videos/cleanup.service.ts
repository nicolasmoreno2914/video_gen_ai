import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { VideoJob } from '../database/entities/video-job.entity';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);
  private readonly basePath = process.env.STORAGE_BASE_PATH ?? '/tmp/video-engine';

  constructor(
    @InjectRepository(VideoJob)
    private readonly videoJobRepo: Repository<VideoJob>,
  ) {}

  @Cron('0 2 * * *')
  async cleanOldLocalVideos(): Promise<void> {
    this.logger.log('[CleanupService] Iniciando limpieza de videos locales > 7 días');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const oldJobs = await this.videoJobRepo.find({
      where: {
        local_mp4_available: true,
        created_at: LessThan(cutoff),
      },
    });

    for (const job of oldJobs) {
      if (job.local_mp4_path && fs.existsSync(job.local_mp4_path)) {
        try {
          fs.rmSync(job.local_mp4_path, { force: true });
          await this.videoJobRepo.update(job.id, {
            local_mp4_available: false,
            local_mp4_path: null,
          });
          this.logger.log(`[CleanupService] [${job.id}] Video local eliminado`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[CleanupService] [${job.id}] Error al limpiar: ${msg}`);
        }
      }
    }

    this.logger.log(`[CleanupService] ${oldJobs.length} jobs procesados en limpieza`);
  }

  @Cron('0 3 * * *')
  async cleanOldLogs(): Promise<void> {
    const logsDir = path.join(this.basePath, 'logs');
    if (!fs.existsSync(logsDir)) return;

    const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS ?? '14', 10);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    try {
      const files = fs.readdirSync(logsDir);
      for (const file of files) {
        const filePath = path.join(logsDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.rmSync(filePath, { force: true });
          this.logger.log(`[CleanupService] Log eliminado: ${file}`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[CleanupService] Error limpiando logs: ${msg}`);
    }
  }
}
