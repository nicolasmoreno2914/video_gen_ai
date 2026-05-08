/**
 * Standalone worker entrypoint — Render Background Worker
 *
 * Starts only the NestJS application context (no HTTP server).
 * BullMQ processors in QueueModule pick up jobs from Redis automatically.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const storagePath = process.env.STORAGE_BASE_PATH ?? '/tmp/video-engine';
  fs.mkdirSync(path.join(storagePath, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(storagePath, 'jobs'), { recursive: true });

  // createApplicationContext = NestJS DI without HTTP adapter
  await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

  console.log('[Worker] Video processing worker started');
  console.log('[Worker] Listening for jobs on BullMQ queue...');
  console.log(`[Worker] Storage driver: ${process.env.STORAGE_DRIVER ?? 'local'}`);
  console.log(`[Worker] Node env: ${process.env.NODE_ENV ?? 'development'}`);
}

bootstrap().catch((err: Error) => {
  console.error('[Worker] Bootstrap error:', err.message);
  process.exit(1);
});
