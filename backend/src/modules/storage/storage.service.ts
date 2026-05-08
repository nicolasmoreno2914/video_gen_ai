import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfig } from '../../config/configuration';

// S3Client is imported dynamically only when STORAGE_DRIVER=r2 to avoid
// boot-time errors when the package isn't needed in local dev.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S3ClientType = any;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: 'local' | 'r2';
  private readonly basePath: string;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private s3: S3ClientType = null;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const storage = configService.get<AppConfig['storage']>('storage')!;
    this.driver = (storage.driver ?? 'local') as 'local' | 'r2';
    this.basePath = storage.basePath;
    this.bucket = storage.r2.bucket;
    this.publicBaseUrl = (storage.r2.publicBaseUrl ?? '').replace(/\/$/, '');

    if (this.driver === 'r2') {
      this.initR2(storage.r2);
    }
  }

  private initR2(r2: AppConfig['storage']['r2']): void {
    try {
      // Dynamic require so the package is only loaded when needed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3Client } = require('@aws-sdk/client-s3');
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: r2.accessKeyId,
          secretAccessKey: r2.secretAccessKey,
        },
      });
      this.logger.log('[StorageService] Driver: r2');
    } catch {
      this.logger.error('[StorageService] @aws-sdk/client-s3 not installed. Run: npm install @aws-sdk/client-s3');
    }
  }

  isR2(): boolean {
    return this.driver === 'r2';
  }

  /**
   * Upload a local file to R2 (or no-op for local driver).
   * Returns the public URL (R2) or the local filesystem path (local).
   */
  async upload(localPath: string, remoteKey: string): Promise<string> {
    if (this.driver === 'local') {
      return localPath;
    }

    if (!this.s3) {
      this.logger.error('[StorageService] R2 client not initialised — falling back to local path');
      return localPath;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PutObjectCommand } = require('@aws-sdk/client-s3');

    const fileBuffer = fs.readFileSync(localPath);
    const contentType = this.resolveContentType(localPath);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: remoteKey,
        Body: fileBuffer,
        ContentType: contentType,
      }),
    );

    const url = this.getPublicUrl(remoteKey);
    this.logger.log(`[StorageService] Uploaded → ${url}`);
    return url;
  }

  /** Returns the public URL for a remote key. */
  getPublicUrl(remoteKey: string): string {
    if (this.driver === 'local') return remoteKey;
    return `${this.publicBaseUrl}/${remoteKey}`;
  }

  /** Upload job output files (mp4 + thumbnail) and return their public URLs. */
  async uploadJobOutput(jobId: string, localMp4Path: string, localThumbnailPath?: string) {
    const mp4Key = `jobs/${jobId}/output/final.mp4`;
    const thumbKey = `jobs/${jobId}/output/thumbnail.png`;

    const [mp4Url, thumbnailUrl] = await Promise.all([
      this.upload(localMp4Path, mp4Key),
      localThumbnailPath && fs.existsSync(localThumbnailPath)
        ? this.upload(localThumbnailPath, thumbKey)
        : Promise.resolve(localThumbnailPath ?? null),
    ]);

    return { mp4Url, thumbnailUrl };
  }

  async exists(keyOrPath: string): Promise<boolean> {
    if (this.driver === 'local') {
      return fs.existsSync(keyOrPath);
    }

    if (!this.s3) return false;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { HeadObjectCommand } = require('@aws-sdk/client-s3');
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: keyOrPath }));
      return true;
    } catch {
      return false;
    }
  }

  async delete(keyOrPath: string): Promise<void> {
    if (this.driver === 'local') {
      if (fs.existsSync(keyOrPath)) fs.unlinkSync(keyOrPath);
      return;
    }

    if (!this.s3) return;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: keyOrPath }));
  }

  /** Ensure a local temp directory exists (used by renderer). */
  ensureDir(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  /** Resolve base storage path for a job. */
  jobDir(jobId: string): string {
    return path.join(this.basePath, 'jobs', jobId);
  }

  private resolveContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.srt': 'text/plain',
      '.vtt': 'text/vtt',
    };
    return map[ext] ?? 'application/octet-stream';
  }
}
