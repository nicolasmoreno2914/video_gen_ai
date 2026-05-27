export interface AppConfig {
  port: number;
  nodeEnv: string;
  secret: string;
  skipAuth: boolean;
  corsOrigin: string;
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
  databaseUrl: string | null;
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redisUrl: string | null;
  redis: {
    host: string;
    port: number;
  };
  queue: {
    concurrency: number;
  };
  openai: {
    apiKey: string;
    model: string;
    imageModel: string;
    imageSize: string;
    imageQuality: string;
  };
  elevenlabs: {
    apiKey: string;
    defaultVoiceId: string;
    modelId: string;
  };
  youtube: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  storage: {
    basePath: string;
    driver: string;
    r2: {
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucket: string;
      publicBaseUrl: string;
    };
  };
  video: {
    fps: number;
    resolutionWidth: number;
    resolutionHeight: number;
    defaultTargetDurationMinutes: number;
    defaultVisualStyle: string;
    enableZoomEffect: boolean;
  };
  rateLimit: {
    defaultDailyVideoLimit: number;
  };
  logs: {
    level: string;
    retentionDays: number;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3500', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // Generic env var name — set API_SECRET in Render; for local use ORBIA_VIDEO_ENGINE_SECRET as alias
  secret: process.env.API_SECRET ?? process.env.ORBIA_VIDEO_ENGINE_SECRET ?? 'change_me_in_production',
  skipAuth: process.env.SKIP_AUTH === 'true',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },
  // DATABASE_URL takes priority over individual DB_* vars
  databaseUrl: process.env.DATABASE_URL ?? null,
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: process.env.DB_NAME ?? 'video_engine',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  },
  // REDIS_URL takes priority over individual REDIS_HOST/PORT vars
  redisUrl: process.env.REDIS_URL ?? null,
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY ?? '2', 10),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    imageModel: process.env.OPENAI_IMAGE_MODEL ?? 'dall-e-3',
    imageSize: process.env.OPENAI_IMAGE_SIZE ?? '1792x1024',
    imageQuality: process.env.OPENAI_IMAGE_QUALITY ?? 'standard',
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY ?? '',
    defaultVoiceId: process.env.ELEVENLABS_DEFAULT_VOICE_ID ?? '',
    modelId: process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2',
  },
  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID ?? '',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? '',
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN ?? '',
  },
  storage: {
    basePath: process.env.STORAGE_BASE_PATH ?? '/tmp/video-engine',
    driver: process.env.STORAGE_DRIVER ?? 'local',
    r2: {
      accountId: process.env.R2_ACCOUNT_ID ?? '',
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      bucket: process.env.R2_BUCKET ?? '',
      publicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? '',
    },
  },
  video: {
    fps: parseInt(process.env.DEFAULT_FPS ?? '30', 10),
    resolutionWidth: parseInt(process.env.DEFAULT_RESOLUTION_WIDTH ?? '1920', 10),
    resolutionHeight: parseInt(process.env.DEFAULT_RESOLUTION_HEIGHT ?? '1080', 10),
    defaultTargetDurationMinutes: parseInt(process.env.DEFAULT_TARGET_DURATION_MINUTES ?? '10', 10),
    defaultVisualStyle: process.env.DEFAULT_VISUAL_STYLE ?? 'notebooklm',
    enableZoomEffect: process.env.ENABLE_ZOOM_EFFECT === 'true',
  },
  rateLimit: {
    defaultDailyVideoLimit: parseInt(process.env.DEFAULT_DAILY_VIDEO_LIMIT ?? '10', 10),
  },
  logs: {
    level: process.env.LOG_LEVEL ?? 'log',
    retentionDays: parseInt(process.env.LOG_RETENTION_DAYS ?? '14', 10),
  },
});
