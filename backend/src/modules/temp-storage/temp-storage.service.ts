import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { TempFile } from './entities/temp-file.entity';

export interface StoredFile {
  file_id: string;
  download_url: string;
  expires_at: string;       // ISO string
  size_bytes: number | null;
  duration_seconds: number | null;
  checksum_sha256: string | null;
}

@Injectable()
export class TempStorageService {
  private readonly logger = new Logger(TempStorageService.name);

  /** Absolute path to the temp video directory */
  private readonly tempDir: string;

  /** TTL in seconds (default 3 hours) */
  private readonly ttlSeconds: number;

  /** Base URL of this Videogen server (used to build download URLs) */
  private readonly baseUrl: string;

  constructor(
    @InjectRepository(TempFile)
    private readonly repo: Repository<TempFile>,
  ) {
    this.tempDir = path.resolve(
      process.env.TEMP_VIDEO_DIR ?? './storage/temp-videos',
    );
    this.ttlSeconds = parseInt(
      process.env.TEMP_FILE_TTL_SECONDS ?? '10800',
      10,
    );
    this.baseUrl = (process.env.PUBLIC_API_URL ?? '').replace(/\/$/, '');
    fs.mkdirSync(this.tempDir, { recursive: true });
    this.logger.log(`[TempStorage] dir=${this.tempDir} ttl=${this.ttlSeconds}s`);
  }

  /**
   * Copy a local MP4 file into temp storage and return a signed download URL.
   * @param sourcePath  Absolute path of the source MP4.
   * @param jobId       Optional originating VideoJob ID.
   */
  async storeFile(sourcePath: string, jobId?: string): Promise<StoredFile> {
    const fileId = crypto.randomUUID();
    const destName = `${fileId}.mp4`;
    const destPath = path.join(this.tempDir, destName);

    fs.copyFileSync(sourcePath, destPath);

    const stat = fs.statSync(destPath);
    const checksum = this.sha256File(destPath);
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    const record = this.repo.create({
      id: fileId,
      file_path: destName,
      job_id: jobId ?? null,
      size_bytes: stat.size,
      duration_seconds: null,
      checksum_sha256: checksum,
      expires_at: expiresAt,
    });
    await this.repo.save(record);

    const downloadUrl = this.buildSignedUrl(fileId, expiresAt);
    this.logger.log(`[TempStorage] stored file_id=${fileId} size=${stat.size} expires=${expiresAt.toISOString()}`);

    return {
      file_id: fileId,
      download_url: downloadUrl,
      expires_at: expiresAt.toISOString(),
      size_bytes: stat.size,
      duration_seconds: null,
      checksum_sha256: checksum,
    };
  }

  /**
   * Register a test entry (no real file) and return a signed URL pointing to a
   * well-known public test video. Used only when VIDEOGEN_TEST_MODE=true.
   */
  async storeTestEntry(): Promise<StoredFile> {
    const fileId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    const record = this.repo.create({
      id: fileId,
      file_path: '__test__',          // sentinel — no real file
      job_id: null,
      size_bytes: 788493,
      duration_seconds: 10,
      checksum_sha256: 'test-mode-no-real-checksum',
      expires_at: expiresAt,
    });
    await this.repo.save(record);

    const downloadUrl = this.buildSignedUrl(fileId, expiresAt);
    return {
      file_id: fileId,
      download_url: downloadUrl,
      expires_at: expiresAt.toISOString(),
      size_bytes: 788493,
      duration_seconds: 10,
      checksum_sha256: 'test-mode-no-real-checksum',
    };
  }

  /**
   * Verify a signed download request and return the absolute path on disk.
   * Returns null if signature is invalid, expired, or file not found.
   */
  async resolveDownload(
    fileId: string,
    sig: string,
    exp: string,
  ): Promise<{ filePath: string; isTest: boolean; record: TempFile } | null> {
    const expTs = parseInt(exp, 10);
    if (isNaN(expTs) || Date.now() / 1000 > expTs) return null;

    if (!this.verifySignature(fileId, exp, sig)) return null;

    const record = await this.repo.findOne({ where: { id: fileId } });
    if (!record) return null;
    if (record.expires_at < new Date()) return null;

    const isTest = record.file_path === '__test__';
    const filePath = isTest ? '' : path.join(this.tempDir, record.file_path);
    if (!isTest && !fs.existsSync(filePath)) return null;

    return { filePath, isTest, record };
  }

  async markDownloaded(fileId: string): Promise<void> {
    await this.repo.update(fileId, { downloaded_at: new Date() });
  }

  /** Delete all records and files whose expires_at is in the past. */
  async purgeExpired(): Promise<number> {
    const expired = await this.repo
      .createQueryBuilder('tf')
      .where('tf.expires_at < NOW()')
      .getMany();

    let deleted = 0;
    for (const record of expired) {
      if (record.file_path !== '__test__') {
        const filePath = path.join(this.tempDir, record.file_path);
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          this.logger.warn(`[TempStorage] Could not delete ${filePath}: ${(e as Error).message}`);
        }
      }
      await this.repo.delete(record.id);
      deleted++;
    }

    if (deleted > 0) {
      this.logger.log(`[TempStorage] Purged ${deleted} expired file(s)`);
    }
    return deleted;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  buildSignedUrl(fileId: string, expiresAt: Date): string {
    const exp = Math.floor(expiresAt.getTime() / 1000).toString();
    const sig = this.sign(fileId, exp);
    return `${this.baseUrl}/api/v1/temp-files/${fileId}/download?exp=${exp}&sig=${sig}`;
  }

  private sign(fileId: string, exp: string): string {
    const secret = process.env.TEMP_DOWNLOAD_SECRET ?? 'insecure-change-me';
    return crypto
      .createHmac('sha256', secret)
      .update(`${fileId}.${exp}`)
      .digest('hex');
  }

  private verifySignature(fileId: string, exp: string, sig: string): boolean {
    const expected = this.sign(fileId, exp);
    try {
      const a = Buffer.from(sig, 'hex');
      const b = Buffer.from(expected, 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  private sha256File(filePath: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  }
}
