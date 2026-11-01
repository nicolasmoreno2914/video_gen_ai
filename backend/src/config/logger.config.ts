import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

const basePath = process.env.STORAGE_BASE_PATH ?? '/tmp/video-engine';
const retentionDays = process.env.LOG_RETENTION_DAYS ?? '14';
const isDev = process.env.NODE_ENV !== 'production';

// LOG_LEVEL usa los nombres de Nest ('log', 'fatal'), que winston no conoce: con level 'log' no
// se escribía ningún registro. nest-winston envía logger.log() como 'info'.
const NEST_TO_WINSTON: Record<string, string> = { log: 'info', fatal: 'error' };

function winstonLevel(level: string | undefined): string {
  const l = (level ?? 'log').toLowerCase();
  return NEST_TO_WINSTON[l] ?? l;
}

export function createWinstonLogger(): ReturnType<typeof WinstonModule.createLogger> {
  const transports: winston.transport[] = [
    new winston.transports.DailyRotateFile({
      // Archivo por proceso: dos procesos rotando el mismo archivo se pisan
      filename: `${basePath}/logs/${process.env.VIDEOGEN_ROLE === 'worker' ? 'worker' : 'app'}-%DATE%.log`,
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
    level: winstonLevel(process.env.LOG_LEVEL),
    transports,
  });
}
