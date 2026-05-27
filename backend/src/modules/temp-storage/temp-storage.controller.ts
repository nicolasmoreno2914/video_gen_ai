import {
  Controller, Get, Param, Query, Res, NotFoundException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import { TempStorageService } from './temp-storage.service';

// Public sample video used in test mode (no real file generated)
const TEST_VIDEO_REDIRECT = 'https://www.w3schools.com/html/mov_bbb.mp4';

@Controller('api/v1/temp-files')
export class TempStorageController {
  private readonly logger = new Logger(TempStorageController.name);

  constructor(private readonly svc: TempStorageService) {}

  /**
   * GET /api/v1/temp-files/:fileId/download?exp=<unix>&sig=<hmac>
   *
   * Streams the MP4 to the caller if the signed URL is valid and not expired.
   * Cursia calls this to download each generated video before uploading to YouTube.
   */
  @Get(':fileId/download')
  async download(
    @Param('fileId') fileId: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!exp || !sig) {
      throw new BadRequestException({ success: false, code: 'MISSING_PARAMS', message: 'exp and sig are required' });
    }

    const result = await this.svc.resolveDownload(fileId, sig, exp);
    if (!result) {
      throw new NotFoundException({ success: false, code: 'NOT_FOUND_OR_EXPIRED', message: 'File not found or URL has expired' });
    }

    await this.svc.markDownloaded(fileId);

    // Test mode: redirect to sample video
    if (result.isTest) {
      this.logger.log(`[TempStorage] test-mode download file_id=${fileId}`);
      res.redirect(302, TEST_VIDEO_REDIRECT);
      return;
    }

    // Production: stream the local MP4
    const { filePath, record } = result;
    this.logger.log(`[TempStorage] streaming file_id=${fileId} path=${filePath}`);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${fileId}.mp4"`);
    if (record.size_bytes) {
      res.setHeader('Content-Length', record.size_bytes.toString());
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      this.logger.error(`[TempStorage] stream error for ${fileId}: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ success: false, code: 'STREAM_ERROR', message: 'Could not read file' });
      }
    });
    stream.pipe(res);
  }
}
