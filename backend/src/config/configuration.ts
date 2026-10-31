import { DEFAULT_OPENAI_TTS_INSTRUCTIONS, DEFAULT_OPENAI_TTS_MODEL } from '../modules/voice/openai-tts.constants';

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
    imageModelPrecise: string;
    imageSize: string;
    imageQuality: string;
    visionModel: string;
    ttsModel: string;
    ttsInstructions: string;
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
    animatedSlides: boolean;
    subtitlesMode: 'burned' | 'sidecar';
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
    // gpt-4.1 sigue mejor la longitud pedida que gpt-4o (≈745 vs ≈410 palabras) por el mismo costo
    model: process.env.OPENAI_MODEL ?? 'gpt-4.1',
    // dall-e-3 y gpt-image-1 ya no generan imágenes (2026-10): defaults a la familia gpt-image vigente
    imageModel: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1-mini',
    // Portada, gancho y escenas de precisión alta (anatomía, procedimientos, técnica)
    imageModelPrecise: process.env.OPENAI_IMAGE_MODEL_PRECISE ?? 'gpt-image-2',
    imageSize: process.env.OPENAI_IMAGE_SIZE ?? '1536x1024',
    imageQuality: process.env.OPENAI_IMAGE_QUALITY ?? 'medium',
    // Verifica las imágenes de precisión alta contra image_check
    visionModel: process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini',
    // Snapshot fijado: el alias 'gpt-4o-mini-tts' se cuelga (125–172 s) desde 2026-10-15/16
    ttsModel: process.env.OPENAI_TTS_MODEL?.trim() || DEFAULT_OPENAI_TTS_MODEL,
    ttsInstructions: process.env.OPENAI_TTS_INSTRUCTIONS?.trim() || DEFAULT_OPENAI_TTS_INSTRUCTIONS,
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
    // Slides animados sincronizados con la voz (captura por fotogramas clave)
    animatedSlides: process.env.ANIMATED_SLIDES === 'true',
    // burned: subtítulos quemados en el video; sidecar: solo el archivo subtitles.vtt (sin texto
    // redundante en pantalla; el reproductor o el LMS los muestra si el estudiante los activa)
    subtitlesMode: process.env.SUBTITLES_MODE === 'sidecar' ? 'sidecar' : 'burned',
  },
  rateLimit: {
    defaultDailyVideoLimit: parseInt(process.env.DEFAULT_DAILY_VIDEO_LIMIT ?? '10', 10),
  },
  logs: {
    level: process.env.LOG_LEVEL ?? 'log',
    retentionDays: parseInt(process.env.LOG_RETENTION_DAYS ?? '14', 10),
  },
});
