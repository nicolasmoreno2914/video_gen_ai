import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

const basePath = process.env.STORAGE_BASE_PATH ?? '/tmp/video-engine';
const retentionDays = process.env.LOG_RETENTION_DAYS ?? '14';
const isDev = process.env.NODE_ENV !== 'production';

export function createWinstonLogger(): ReturnType<typeof WinstonModule.createLogger> {
  const transports: winston.transport[] = [
    new winston.transports.DailyRotateFile({
      filename: `${basePath}/logs/app-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      maxFiles: `${retentionDays}d`,
      zippedArchive: false,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  ];

  if (isDev) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.printf(({ timestamp, level, message, context }) => {
            const ctx = context ? `[${context}] ` : '';
            return `${timestamp} ${level} ${ctx}${message}`;
          }),
        ),
      }),
    );
  }

  return WinstonModule.createLogger({
    level: process.env.LOG_LEVEL ?? 'log',
    transports,
  });
}
