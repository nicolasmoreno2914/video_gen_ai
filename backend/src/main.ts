import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { createWinstonLogger } from './config/logger.config';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap(): Promise<void> {
  console.log('[BOOT] Starting Video Engine API...');
  console.log('[BOOT] NODE_ENV:', process.env.NODE_ENV);
  console.log('[BOOT] PORT:', process.env.PORT ?? '(not set, will use 3500)');
  console.log('[BOOT] DATABASE_URL exists:', !!process.env.DATABASE_URL);
  console.log('[BOOT] REDIS_URL exists:', !!process.env.REDIS_URL);
  console.log('[BOOT] SUPABASE_URL exists:', !!process.env.SUPABASE_URL);
  console.log('[BOOT] STORAGE_BASE_PATH:', process.env.STORAGE_BASE_PATH ?? '/tmp/video-engine');

  const storagePath = process.env.STORAGE_BASE_PATH ?? '/tmp/video-engine';
  try {
    fs.mkdirSync(path.join(storagePath, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(storagePath, 'jobs'), { recursive: true });
    console.log('[BOOT] Storage directories created OK');
  } catch (err) {
    console.error('[BOOT] WARNING: Could not create storage directories:', (err as Error).message);
    // Non-fatal — continue bootstrap
  }

  console.log('[BOOT] Initializing NestJS app...');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
    logger: createWinstonLogger(),
  });

  console.log('[BOOT] NestJS app created OK');

  app.setGlobalPrefix('api', { exclude: ['health', 'health/(.*)'] });

  // CORS_ORIGIN accepts comma-separated origins or '*' for open access (dev only)
  const rawOrigin = process.env.CORS_ORIGIN ?? '*';
  const corsOrigin: string | string[] =
    rawOrigin === '*'
      ? '*'
      : rawOrigin.split(',').map((o) => o.trim()).filter(Boolean);

  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = process.env.PORT ?? '3500';
  console.log('[BOOT] About to listen on port', port);
  await app.listen(parseInt(port, 10), '0.0.0.0');

  console.log(`[BOOT] Server listening successfully on port ${port}`);
  console.log(`[BOOT] Health check: http://0.0.0.0:${port}/health`);
}

bootstrap().catch((err: Error) => {
  console.error('[BOOT] FATAL Bootstrap error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
