import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TempStorageService } from './temp-storage.service';

@Injectable()
export class TempStorageCleanupService {
  private readonly logger = new Logger(TempStorageCleanupService.name);

  constructor(private readonly tempStorage: TempStorageService) {}

  /** Run every hour — delete expired temp files from disk and DB */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredFiles(): Promise<void> {
    this.logger.log('[Cleanup] Purging expired temp files...');
    try {
      const count = await this.tempStorage.purgeExpired();
      this.logger.log(`[Cleanup] Done — ${count} expired file(s) removed`);
    } catch (err) {
      this.logger.error(`[Cleanup] Error during purge: ${(err as Error).message}`);
    }
  }
}
