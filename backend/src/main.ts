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
  const storagePath = process.env.STORAGE_BASE_PATH ?? '/tmp/video-engine';
  fs.mkdirSync(path.join(storagePath, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(storagePath, 'jobs'), { recursive: true });

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: createWinstonLogger(),
  });

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
  await app.listen(parseInt(port, 10), '0.0.0.0');

  console.log(`[VideoEngineIA] Backend running on port ${port}`);
  console.log(`[VideoEngineIA] Health check: http://0.0.0.0:${port}/health`);
}

bootstrap().catch((err: Error) => {
  console.error('Bootstrap error:', err.message);
  process.exit(1);
});
