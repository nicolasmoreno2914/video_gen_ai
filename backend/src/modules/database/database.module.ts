import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../../config/configuration';
import { Institution } from './entities/institution.entity';
import { VideoJob } from './entities/video-job.entity';
import { VideoScene } from './entities/video-scene.entity';
import { ApiUsageLog } from './entities/api-usage-log.entity';
import { InstitutionUser } from './entities/institution-user.entity';
import { ApiKey } from './entities/api-key.entity';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { OAuthConnection } from './entities/oauth-connection.entity';
import { CursiaBatch } from '../cursia/entities/cursia-batch.entity';
import { CursiaItem } from '../cursia/entities/cursia-item.entity';
import { TempFile } from '../temp-storage/entities/temp-file.entity';

const entities = [
  Institution, VideoJob, VideoScene, ApiUsageLog,
  InstitutionUser, ApiKey, WebhookEndpoint, OAuthConnection,
  CursiaBatch, CursiaItem, TempFile,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        const nodeEnv = config.get('nodeEnv');
        const isProduction = nodeEnv !== 'development';
        const databaseUrl = config.get('databaseUrl');

        const base = {
          type: 'postgres' as const,
          entities,
          migrations: ['dist/modules/database/migrations/*.js'],
          synchronize: false,
          logging: !isProduction,
        };

        // DATABASE_URL takes priority — used in Render (Supabase connection string)
        if (databaseUrl) {
          return {
            ...base,
            url: databaseUrl,
            ssl: isProduction ? { rejectUnauthorized: false } : false,
          };
        }

        // Fall back to individual vars — used locally via docker-compose
        const db = config.get<AppConfig['db']>('db')!;
        return {
          ...base,
          host: db.host,
          port: db.port,
          database: db.name,
          username: db.user,
          password: db.password,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
