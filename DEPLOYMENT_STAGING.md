# Video Engine IA — Staging Deployment Guide

## Estrategia actual (sin tarjeta de crédito)

```
Cloudflare Pages  → Frontend (React/Vite)         [gratis, sin tarjeta] ✅
Supabase          → PostgreSQL + Auth              [gratis, sin tarjeta] ✅
Upstash           → Redis (BullMQ)                [gratis, sin tarjeta] ✅
Mac local         → Backend API + Worker           [sin costo]
Mac local         → FFmpeg + Puppeteer renders     [sin costo]
Cloudflare Tunnel → Expone backend local al mundo  [gratis, sin tarjeta]
```

### Qué se puede validar con esta estrategia

| Feature | ¿Funciona? |
|---------|-----------|
| Frontend UI, routing, formularios | ✅ |
| Login con Supabase Auth | ✅ |
| Health checks (`/health`, `/health/deep`) | ✅ |
| API externa (`test_only: true`) | ✅ |
| Creación de jobs y estado | ✅ |
| Renders reales (FFmpeg + Puppeteer) | ✅ (worker local) |
| Storage de videos persistente en la nube | ❌ (requiere R2 con tarjeta) |
| Backend siempre disponible sin tu Mac | ❌ (requiere servidor pago) |

---

## Arquitectura de staging temporal

```
Usuario → Cloudflare Pages (frontend) → Cloudflare Tunnel → Backend local (Mac)
                                                                    ↓
                                                         Supabase (DB + Auth)
                                                         Upstash Redis
                                                         Worker local
                                                         /tmp/video-engine (storage)
```

---

## Credenciales recolectadas ✅

```
# Supabase
SUPABASE_URL=https://vokytkpwkboevfrllwty.supabase.co
SUPABASE_ANON_KEY=sb_publishable_X2yfWLBHcmxp9tRIusAXIg_f-geFScq
SUPABASE_SERVICE_ROLE_KEY=sb_secret_4RPClfsWLykYBrLtEcF1bg_Zth8Wd49
SUPABASE_JWT_SECRET=VOdg+U2bWYcB9UH475Ohj8YFMFDc6rnxHVhOqyQK1txWdQtj7/sQkuNqd91J48tzjuh7/Iin4osWYsm3h7KPXQ==
DATABASE_URL=postgresql://postgres:Vg9%23mK2%24pL8nXw4!@db.vokytkpwkboevfrllwty.supabase.co:5432/postgres

# Redis (Upstash)
REDIS_URL=rediss://default:gQAAAAAAAAdD7AAIgcDI1OGM4NzU2M2FkZmI0MWI1OTZhZDQ4NjZhYjQ1ZTJiMQ@finer-anchovy-119035.upstash.io:6379

# Storage
STORAGE_DRIVER=local
STORAGE_BASE_PATH=/tmp/video-engine
```

---

## Step 1 — GitHub ✅ Done

Repo: https://github.com/nicolasmoreno2914/video_gen_ai  
Branch `staging` ya pusheado.

---

## Step 2 — Backend local con Cloudflare Tunnel

### 2.1 — Crear `.env.staging` en backend

```bash
cat > /Users/nicolas/Documents/video-engine-ia/backend/.env.staging << 'EOF'
NODE_ENV=staging
PORT=3500
API_SECRET=<genera con: openssl rand -hex 32>

SUPABASE_URL=https://vokytkpwkboevfrllwty.supabase.co
SUPABASE_ANON_KEY=sb_publishable_X2yfWLBHcmxp9tRIusAXIg_f-geFScq
SUPABASE_SERVICE_ROLE_KEY=sb_secret_4RPClfsWLykYBrLtEcF1bg_Zth8Wd49
SUPABASE_JWT_SECRET=VOdg+U2bWYcB9UH475Ohj8YFMFDc6rnxHVhOqyQK1txWdQtj7/sQkuNqd91J48tzjuh7/Iin4osWYsm3h7KPXQ==
DATABASE_URL=postgresql://postgres:Vg9%23mK2%24pL8nXw4!@db.vokytkpwkboevfrllwty.supabase.co:5432/postgres

REDIS_URL=rediss://default:gQAAAAAAAAdD7AAIgcDI1OGM4NzU2M2FkZmI0MWI1OTZhZDQ4NjZhYjQ1ZTJiMQ@finer-anchovy-119035.upstash.io:6379

OPENAI_API_KEY=<tu key>
OPENAI_MODEL=gpt-4o
OPENAI_IMAGE_MODEL=dall-e-3
OPENAI_IMAGE_SIZE=1792x1024
OPENAI_IMAGE_QUALITY=standard

ELEVENLABS_API_KEY=<tu key>
ELEVENLABS_DEFAULT_VOICE_ID=<tu voice ID>
ELEVENLABS_MODEL_ID=eleven_multilingual_v2

STORAGE_DRIVER=local
STORAGE_BASE_PATH=/tmp/video-engine

DEFAULT_FPS=30
DEFAULT_RESOLUTION_WIDTH=1920
DEFAULT_RESOLUTION_HEIGHT=1080
DEFAULT_TARGET_DURATION_MINUTES=7
DEFAULT_VISUAL_STYLE=notebooklm
DEFAULT_DAILY_VIDEO_LIMIT=10
QUEUE_CONCURRENCY=2
LOG_LEVEL=log

PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
EOF
```

### 2.2 — Levantar backend con env de staging

```bash
cd /Users/nicolas/Documents/video-engine-ia/backend
npm run build
NODE_ENV=staging $(cat .env.staging | grep -v '^#' | xargs) node dist/main
```

O con docker-compose si está configurado.

### 2.3 — Instalar y correr Cloudflare Tunnel

```bash
# Instalar cloudflared (Mac)
brew install cloudflared

# Exponer backend local al mundo (sin cuenta, URL temporal)
cloudflared tunnel --url http://localhost:3500
```

Cloudflare imprime una URL como:
```
https://abc-def-123.trycloudflare.com
```

Esa URL es tu `VITE_API_URL` para el frontend. Cópiala.

> ⚠️ La URL cambia cada vez que reinicias el tunnel. Para una URL fija necesitas crear un tunnel con cuenta (gratis pero requiere login en Cloudflare).

### 2.4 — Correr worker local (para renders reales)

En otra terminal:

```bash
cd /Users/nicolas/Documents/video-engine-ia/backend
NODE_ENV=staging $(cat .env.staging | grep -v '^#' | xargs) node dist/worker
```

### 2.5 — Correr migraciones (primera vez)

```bash
cd /Users/nicolas/Documents/video-engine-ia/backend
NODE_ENV=staging $(cat .env.staging | grep -v '^#' | xargs) npm run migration:run
```

---

## Step 3 — Cloudflare Pages: Frontend

1. Cloudflare dashboard → Pages → Create a project (sin tarjeta)
2. Connect GitHub → `nicolasmoreno2914/video_gen_ai`
3. Branch: `staging`
4. **Build settings:**
   - Root directory: `frontend`
   - Build command: `npm run build`
   - Output directory: `dist`
5. **Environment variables:**
   ```
   VITE_API_URL=https://abc-def-123.trycloudflare.com
   VITE_SUPABASE_URL=https://vokytkpwkboevfrllwty.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_X2yfWLBHcmxp9tRIusAXIg_f-geFScq
   VITE_SKIP_AUTH=false
   ```
6. Deploy → copia la URL generada (ej: `https://video-engine-ia.pages.dev`)

### Después del primer deploy

Actualiza Supabase → Auth → URL Configuration:
```
Site URL: https://video-engine-ia.pages.dev
Redirect URLs:
  https://video-engine-ia.pages.dev/*
  http://localhost:5173/*
```

Actualiza `CORS_ORIGIN` en `.env.staging`:
```
CORS_ORIGIN=https://video-engine-ia.pages.dev,http://localhost:5173
```

Reinicia el backend y el tunnel.

---

## Step 4 — Post-deploy checklist (staging parcial)

```bash
# Reemplaza TU_TUNNEL_URL con la URL de cloudflared
export API=https://TU_TUNNEL_URL

# Health check básico
curl $API/health

# Health check profundo (DB + Redis)
curl $API/health/deep

# Auth test con API key (créala en /settings del frontend)
curl -H "x-api-key: TU_API_KEY" $API/api/external/auth-test

# Test job con test_only (no consume créditos)
curl -X POST $API/api/external/videos/create \
  -H "x-api-key: TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","topic":"Test topic","test_only":true}'
```

Checklist:
- [ ] `/health` retorna `{ status: "ok", env: "staging" }`
- [ ] `/health/deep` retorna DB y Redis como `ok`
- [ ] Frontend carga en Cloudflare Pages URL
- [ ] Login con Supabase funciona
- [ ] Institution carga en `/settings`
- [ ] API Key creada en `/settings`
- [ ] `auth-test` retorna 200
- [ ] `create` con `test_only: true` retorna 200
- [ ] Worker local procesa un job real (logs en terminal)
- [ ] `/costs` carga y muestra datos de institución
- [ ] `/api/costs/summary` sin token retorna 401

---

## Cuando activar opciones con tarjeta

| Necesidad | Solución | Costo aprox |
|-----------|----------|-------------|
| Backend siempre disponible | Render Standard o Koyeb Pro | $25–30/mes |
| Storage de videos persistente | Cloudflare R2 | ~$0 hasta 10GB |
| Worker en la nube | Render Background Worker | $25/mes |
| URL de tunnel fija | Cloudflare Tunnel con cuenta | Gratis |

---

## Opciones de backend en la nube (para cuando tengas tarjeta)

### Render (render.com)
- New → Blueprint → conecta `nicolasmoreno2914/video_gen_ai` → branch `staging`
- Render lee `render.yaml` y crea API + Worker automáticamente
- Plan Standard ($25/mes por servicio) para renders reales

### Koyeb (koyeb.com)
- Requiere plan Pro ($29/mes actualmente)
- Docker nativo, sin cold starts

### Railway (railway.app)
- $5 crédito/mes con tarjeta
- Docker nativo

---

## Branch Strategy

```bash
# Trabajo diario
git checkout development
# ... cambios ...
git push origin development

# Deploy a staging
git checkout staging
git merge development
git push origin staging
# → Cloudflare Pages auto-deploya el frontend
# → Backend sigue corriendo local hasta activar servidor cloud
```

---

## Troubleshooting

### Tunnel URL cambió
- Actualiza `VITE_API_URL` en Cloudflare Pages → Settings → Environment variables
- Redeploya el frontend (o usa un tunnel con nombre fijo)

### Database connection failed
- Verifica que el password no tenga caracteres sin URL-encode (`#`→`%23`, `$`→`%24`)
- Verifica conectividad: `psql "postgresql://postgres:Vg9%23mK2%24pL8nXw4!@db.vokytkpwkboevfrllwty.supabase.co:5432/postgres"`

### Redis connection failed
- Verifica que `REDIS_URL` empiece con `rediss://` (doble s, TLS)
- Upstash free tier: 10,000 comandos/día

### CORS errors
- Agrega la URL exacta de Pages a `CORS_ORIGIN` y reinicia el backend
