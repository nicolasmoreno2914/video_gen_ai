import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { StorageService } from './storage.service';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('*')
  serveFile(@Param() params: Record<string, string>, @Res() res: Response): void {
    // Only active when STORAGE_DRIVER=local; in R2 mode files are served from Cloudflare
    const rawKey = params['0'] ?? '';

    // Prevent path traversal
    const normalized = path.normalize(rawKey).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = this.storageService.getLocalPath(normalized);

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new NotFoundException('Archivo no encontrado');
    }

    res.sendFile(filePath);
  }
}
