import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Institution } from '../modules/database/entities/institution.entity';
import { VideoJob } from '../modules/database/entities/video-job.entity';
import { VideoScene } from '../modules/database/entities/video-scene.entity';
import { ApiUsageLog } from '../modules/database/entities/api-usage-log.entity';
import { InstitutionUser } from '../modules/database/entities/institution-user.entity';
import { ApiKey } from '../modules/database/entities/api-key.entity';
import { WebhookEndpoint } from '../modules/database/entities/webhook-endpoint.entity';
import { OAuthConnection } from '../modules/database/entities/oauth-connection.entity';

dotenv.config();

const entities = [
  Institution,
  VideoJob,
  VideoScene,
  ApiUsageLog,
  InstitutionUser,
  ApiKey,
  WebhookEndpoint,
  OAuthConnection,
];

const isProduction = process.env.NODE_ENV !== 'development';

// DATABASE_URL takes priority (Render / Supabase connection string)
const connectionOptions = process.env.DATABASE_URL
  ? {
      url: process.env.DATABASE_URL,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      database: process.env.DB_NAME ?? 'video_engine',
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres', // was DB_PASS (typo) — fixed
    };

export default new DataSource({
  type: 'postgres',
  ...connectionOptions,
  entities,
  migrations: ['dist/modules/database/migrations/*.js'],
  synchronize: false,
  logging: !isProduction,
});
