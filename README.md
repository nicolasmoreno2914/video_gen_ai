# Video Engine IA

Genera videos educativos animados a partir de texto de capítulos. Procesa el contenido con GPT-4o, crea ilustraciones con DALL-E 3, sintetiza voz con ElevenLabs, renderiza diapositivas HTML con Puppeteer y ensambla el video final con FFmpeg.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet / Orbia                     │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     nginx (puerto 80)                       │
│   /         → React SPA (dist estático)                    │
│   /api/*    → proxy → backend:3500                         │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
┌─────────────────┐   ┌─────────────────────────────────────┐
│  React 18 + TS  │   │         NestJS 10 + TypeScript       │
│  TailwindCSS    │   │                                     │
│  TanStack Query │   │  ┌─────────────┐  ┌─────────────┐  │
│  React Router   │   │  │ REST API    │  │  BullMQ     │  │
│                 │   │  │ /api/videos │  │  Worker     │  │
│  SSE Progress ──┼───┼─▶│ /api/inst.  │  │             │  │
│  Polling fallbk │   │  └──────┬──────┘  └──────┬──────┘  │
└─────────────────┘   │         │                 │         │
                       │         ▼                 ▼         │
                       │  ┌──────────────────────────────┐  │
                       │  │         PostgreSQL 15         │  │
                       │  │  institutions · video_jobs    │  │
                       │  │  video_scenes · api_usage_logs│  │
                       │  └──────────────────────────────┘  │
                       │                 │                   │
                       │         ┌───────┘                   │
                       │         ▼                           │
                       │  ┌──────────────────────────────┐  │
                       │  │           Redis 7            │  │
                       │  │   Cola BullMQ · pub/sub SSE  │  │
                       │  └──────────────────────────────┘  │
                       └─────────────────────────────────────┘
                                        │
                     ┌──────────────────┼──────────────────┐
                     ▼                  ▼                   ▼
              ┌────────────┐   ┌─────────────┐   ┌──────────────┐
              │  OpenAI    │   │ ElevenLabs  │   │  YouTube     │
              │  GPT-4o    │   │    TTS      │   │  Data API v3 │
              │  DALL-E 3  │   └─────────────┘   └──────────────┘
              └────────────┘
```

### Pipeline de generación (9 pasos)

```
INPUT: texto del capítulo
  │
  ▼
[1] analyzing        — GPT-4o genera guión JSON (16-24 escenas)
[2] generating_images — DALL-E 3, 2 en paralelo, con FALLBACK_PROMPTS
[3] generating_slides — Puppeteer HTML→PNG, 1920×1080, 2 en paralelo
[4] generating_audio  — ElevenLabs TTS, 3 en paralelo, con ffprobe duración
[5] rendering_scenes  — FFmpeg: imagen + audio + subtítulos por escena
[6] concatenating     — concat demuxer → video_final_sin_subtitulos.mp4
[7] adding_subtitles  — SRT completo quemado con ffmpeg
[8] uploading_youtube — googleapis OAuth2 (opcional)
[9] sending_webhook   — axios 3 reintentos (5s/15s/30s)
  │
  ▼
OUTPUT: /tmp/video-engine/jobs/{id}/output/final.mp4
```

**Modo dry-run**: ejecuta pasos 1-5, devuelve `dry_run_completed`, no genera audio/video/YouTube.

---

## Requisitos previos

- Docker Engine ≥ 24 y Docker Compose v2
- Claves de API: OpenAI, ElevenLabs
- (Opcional) Credenciales OAuth2 de YouTube

---

## Setup en 5 pasos

### 1. Clonar y configurar variables de entorno

```bash
git clone <repo-url> video-engine-ia
cd video-engine-ia
cp backend/.env.example backend/.env
```

Editar `backend/.env`:

```env
# Base de datos
DB_HOST=postgres
DB_PORT=5432
DB_NAME=video_engine
DB_USER=video_user
DB_PASS=changeme_db

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Seguridad API
API_SECRET=tu_clave_secreta_aqui

# OpenAI
OPENAI_API_KEY=sk-...

# ElevenLabs
ELEVENLABS_API_KEY=tu_clave_elevenlabs
ELEVENLABS_DEFAULT_VOICE_ID=21m00Tcm4TlvDq8ikWAM  # Rachel (por defecto)

# YouTube (opcional)
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=http://localhost:3500/api/youtube/callback

# App
NODE_ENV=production
PORT=3500
STORAGE_BASE_PATH=/tmp/video-engine
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Límites
MAX_VIDEOS_PER_DAY=10
MAX_CONCURRENT_JOBS=3
CLEANUP_DAYS=30
LOG_LEVEL=info
```

### 2. Levantar los servicios

```bash
docker compose up -d
```

Esto arranca: `frontend` (nginx:80), `backend` (NestJS:3500), `postgres:5432`, `redis:6379`.

Verificar que todos están healthy:

```bash
docker compose ps
```

### 3. Ejecutar migraciones y seed

```bash
# Migraciones
docker compose exec backend npm run migration:run

# Institución por defecto (ID: 00000000-0000-0000-0000-000000000001)
docker compose exec backend npx ts-node src/modules/database/seeds/default-institution.seed.ts
```

### 4. Verificar el health check

```bash
curl http://localhost/api/health
# {"status":"ok","timestamp":"..."}
```

### 5. Abrir la interfaz web

Navegar a `http://localhost` y usar la clave `API_SECRET` configurada para autenticarse.

---

## Configuración YouTube OAuth2

Para habilitar subida automática a YouTube:

### 1. Crear proyecto en Google Cloud Console

1. Ir a [console.cloud.google.com](https://console.cloud.google.com)
2. Crear proyecto → Habilitar **YouTube Data API v3**
3. Credenciales → OAuth 2.0 → Tipo: **Aplicación web**
4. URI de redirección autorizado: `http://tu-dominio/api/youtube/callback`
5. Copiar `Client ID` y `Client Secret` a `.env`

### 2. Autorizar la institución

```bash
# Obtener URL de autorización
curl -H "Authorization: Bearer {API_SECRET}" \
  "http://localhost/api/youtube/auth-url?institution_id=00000000-0000-0000-0000-000000000001"

# Abrir la URL en el navegador, autorizar con la cuenta de YouTube
# El callback guardará los tokens automáticamente en la institución
```

### 3. Verificar

```bash
curl -H "Authorization: Bearer {API_SECRET}" \
  "http://localhost/api/youtube/status?institution_id=00000000-0000-0000-0000-000000000001"
# {"has_credentials": true}
```

Una vez configurado, añadir `"upload_to_youtube": true` al payload de creación de video.

---

## Integración con Orbia (API M2M)

### Autenticación

Todas las peticiones requieren el header:
```
Authorization: Bearer {API_SECRET}
```

### Crear un video

```bash
curl -X POST http://tu-dominio/api/videos \
  -H "Authorization: Bearer {API_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{
    "institution_id": "00000000-0000-0000-0000-000000000001",
    "course_id": "CURSO-001",
    "chapter_id": "CAP-03",
    "chapter_title": "Introducción a la Termodinámica",
    "chapter_text": "La termodinámica es la rama de la física que estudia...",
    "dry_run": false,
    "upload_to_youtube": false,
    "webhook_url": "https://orbia.example.com/webhooks/video-ready",
    "webhook_secret": "secreto_orbia_123"
  }'
```

**Respuesta** (202 Accepted):
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "message": "Video creation job queued successfully"
}
```

### Seguir el progreso (SSE)

```javascript
const source = new EventSource(
  `/api/videos/${jobId}/progress-stream`,
  { headers: { Authorization: `Bearer ${API_SECRET}` } }
);

source.addEventListener('progress', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Paso ${data.step}: ${data.label} — ${data.progress}%`);
});

source.addEventListener('completed', (e) => {
  const data = JSON.parse(e.data);
  console.log('Video listo:', data.download_url);
  source.close();
});

source.addEventListener('failed', (e) => {
  const data = JSON.parse(e.data);
  console.error('Error:', data.error_message);
  source.close();
});
```

### Webhook recibido por Orbia

**Éxito** (`POST webhook_url`):
```json
{
  "event": "video.completed",
  "job_id": "550e8400-...",
  "course_id": "CURSO-001",
  "chapter_id": "CAP-03",
  "status": "completed",
  "download_url": "https://tu-dominio/api/videos/550e8400-.../download",
  "youtube_url": null,
  "duration_seconds": 420,
  "scenes_count": 18,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "signature": "sha256=abc123..."
}
```

**Error** (`POST webhook_url`):
```json
{
  "event": "video.failed",
  "job_id": "550e8400-...",
  "status": "failed",
  "error_message": "ElevenLabs API returned 429",
  "failed_at_step": "generating_audio",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

La firma HMAC-SHA256 se verifica con `webhook_secret` del payload original:
```javascript
const expectedSig = 'sha256=' + crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(payload))
  .digest('hex');
```

### Reintentar un trabajo fallido

```bash
curl -X POST http://tu-dominio/api/videos/{job_id}/retry \
  -H "Authorization: Bearer {API_SECRET}"
```

El sistema retoma desde el último paso completado (checkpoint recovery).

### Endpoints completos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/videos` | Crear video |
| `GET` | `/api/videos` | Listar videos (paginado) |
| `GET` | `/api/videos/:id` | Detalle de un video |
| `GET` | `/api/videos/:id/progress-stream` | SSE de progreso |
| `GET` | `/api/videos/:id/download` | Descargar MP4 |
| `POST` | `/api/videos/:id/retry` | Reintentar fallido |
| `GET` | `/api/institutions` | Listar instituciones |
| `POST` | `/api/institutions` | Crear institución |
| `GET` | `/api/institutions/:id` | Detalle |
| `PATCH` | `/api/institutions/:id` | Actualizar |
| `GET` | `/api/youtube/auth-url` | URL OAuth2 |
| `GET` | `/api/youtube/callback` | Callback OAuth2 |
| `GET` | `/api/youtube/status` | Ver si tiene credenciales |
| `GET` | `/api/health` | Health check |

---

## Estimación de costos por video

*(~20 escenas, capítulo de 2000 palabras)*

| Servicio | Uso estimado | Costo aproximado |
|----------|-------------|-----------------|
| GPT-4o | ~3000 tokens entrada + ~2000 salida | $0.05 |
| DALL-E 3 | 20 imágenes 1792×1024 | $0.80 |
| ElevenLabs | ~4000 caracteres TTS | $0.06 |
| **Total** | | **~$0.91 / video** |

> Nota: precios de referencia a enero 2024. Verificar tarifas actuales en cada proveedor.

---

## Troubleshooting

### El worker no procesa trabajos

```bash
docker compose logs backend | grep "Worker"
# Verificar conexión Redis
docker compose exec backend node -e "
  const Redis = require('ioredis');
  const r = new Redis({host:'redis',port:6379});
  r.ping().then(v => console.log('Redis OK:', v)).catch(console.error);
"
```

### Error de Puppeteer / Chromium

```bash
# Verificar que chromium está instalado en el contenedor
docker compose exec backend which chromium
docker compose exec backend chromium --version

# Probar renderizado manual
docker compose exec backend node -e "
  const puppeteer = require('puppeteer');
  puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']})
    .then(b => b.version()).then(v => console.log('Puppeteer OK:', v));
"
```

### Error FFmpeg: codec no encontrado

```bash
docker compose exec backend ffmpeg -codecs 2>&1 | grep -E "libx264|aac"
# Debe mostrar ambos. Si falta libx264, el Dockerfile necesita ffmpeg del repo oficial.
```

### Límite de videos diarios alcanzado

Aumentar `MAX_VIDEOS_PER_DAY` en `.env` y reiniciar el backend:
```bash
docker compose restart backend
```

O actualizar directamente en la BD para una institución específica:
```sql
UPDATE institutions SET max_videos_per_day = 50 
WHERE id = '00000000-0000-0000-0000-000000000001';
```

### Ver logs en tiempo real

```bash
# Todos los servicios
docker compose logs -f

# Solo el worker (procesamiento de videos)
docker compose logs -f backend | grep -E "Processor|step|ERROR"

# Logs estructurados del backend (archivo)
docker compose exec backend tail -f logs/$(date +%Y-%m-%d).log
```

### Migrar a producción

1. Cambiar `STORAGE_BASE_PATH` a un volumen persistente montado
2. Configurar `CLEANUP_DAYS` según espacio disponible
3. Usar un `API_SECRET` de al menos 32 caracteres aleatorios
4. Configurar HTTPS en el nginx externo (Cloudflare, Traefik, etc.)
5. Ajustar `MAX_CONCURRENT_JOBS` según CPU disponible (recomendado: núcleos - 1)

---

## Desarrollo local (sin Docker)

```bash
# Backend
cd backend
cp .env.example .env   # ajustar DB_HOST=localhost, REDIS_HOST=localhost
npm install
npm run migration:run
npm run start:dev

# Frontend (en otra terminal)
cd frontend
cp .env.example .env   # VITE_API_URL=http://localhost:3500
npm install
npm run dev
# → http://localhost:5173
```

Requiere PostgreSQL y Redis corriendo localmente.

---

## Estructura del proyecto

```
video-engine-ia/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       ├── config/
│       │   ├── configuration.ts
│       │   ├── datasource.ts
│       │   └── logger.config.ts
│       ├── common/
│       │   ├── filters/
│       │   ├── guards/
│       │   ├── interceptors/
│       │   └── types/
│       └── modules/
│           ├── ai/              # GPT-4o script generation
│           ├── database/        # Entities, migrations, seeds
│           ├── image-generator/ # DALL-E 3
│           ├── institutions/    # Institution CRUD
│           ├── queue/           # BullMQ processor (pipeline)
│           ├── renderer/        # FFmpeg scene rendering
│           ├── slides/          # Puppeteer HTML→PNG
│           ├── videos/          # Video CRUD + SSE + cleanup
│           ├── voice/           # ElevenLabs TTS
│           ├── webhook/         # Outbound webhooks
│           └── youtube/         # OAuth2 + upload
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── .env.example
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── types/
        ├── services/
        ├── hooks/
        ├── components/
        │   ├── video-creator/
        │   ├── progress/
        │   ├── result/
        │   └── ui/
        └── pages/
```
