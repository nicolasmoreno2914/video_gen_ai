# Video Engine IA — Staging Deployment Guide

## Architecture Overview

```
GitHub (branch: staging)
  │
  ├── Cloudflare Pages       → Frontend (React/Vite)
  │     root: frontend/
  │     build: npm run build
  │     output: dist/
  │
  ├── Render Web Service     → Backend API (NestJS)
  │     dockerfile: backend/Dockerfile
  │     command: node dist/main
  │     health: /health
  │
  └── Render Background Worker → Video Processor (BullMQ)
        dockerfile: backend/Dockerfile
        command: node dist/worker

External services:
  Supabase     → PostgreSQL database + Auth
  Upstash      → Redis (BullMQ job queue)
  Cloudflare R2 → Video/thumbnail object storage
```

---

## Branch Strategy

| Branch       | Purpose                      |
|--------------|------------------------------|
| `main`       | Production (future)          |
| `staging`    | Staging deployment           |
| `development`| Daily feature development    |

### Create the staging branch (run once)

```bash
git checkout -b staging
git push -u origin staging
```

---

## Step 1 — GitHub Repository

**Repo:** https://github.com/nicolasmoreno2914/video_gen_ai

Ensure `.gitignore` is committed so these are never pushed:
- `.env`, `.env.*`
- `node_modules/`
- `dist/`
- `*.mp4`, `*.mp3`
- `/tmp/video-engine/`

---

## Step 2 — Supabase

### What you need to do in Supabase dashboard:

1. **Project settings → API** — copy:
   - `SUPABASE_URL` (Project URL)
   - `SUPABASE_ANON_KEY` (anon/public key)
   - `SUPABASE_SERVICE_ROLE_KEY` (service_role key — keep secret)
   - `SUPABASE_JWT_SECRET` (JWT Settings → JWT Secret)

2. **Project settings → Database** — copy the **Connection string** (URI format):
   ```
   DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```

3. **Authentication → URL Configuration** — add (after you have the Cloudflare Pages URL):
   ```
   Site URL: https://YOUR_APP.pages.dev
   Redirect URLs:
     https://YOUR_APP.pages.dev/*
     http://localhost:5173/*
     http://localhost:3000/*
   ```

---

## Step 3 — Upstash Redis

1. Go to [console.upstash.com](https://console.upstash.com) → Create database
2. Choose **Redis**, region closest to your Render region
3. Copy the **Redis URL** (starts with `rediss://`)
   ```
   REDIS_URL=rediss://default:...@....upstash.io:6379
   ```
4. Enable **TLS** (default on Upstash — already handled by `rediss://`)

> Upstash free tier: 10,000 commands/day. Sufficient for staging.

---

## Step 4 — Cloudflare R2

1. Go to Cloudflare dashboard → R2 → Create bucket
   - Bucket name: `video-engine-staging` (or your choice)
   - Region: automatic

2. Create R2 API token:
   - R2 → Manage R2 API Tokens → Create API Token
   - Permissions: **Object Read & Write** on your bucket
   - Copy:
     ```
     R2_ACCOUNT_ID=       (from R2 overview page)
     R2_ACCESS_KEY_ID=    (from API token)
     R2_SECRET_ACCESS_KEY=(from API token)
     R2_BUCKET=video-engine-staging
     ```

3. (Optional but recommended) Enable public access:
   - Bucket → Settings → Public access → Allow Access
   - Or connect a custom subdomain (e.g. `media.yourdomain.com`)
   - Copy the public URL:
     ```
     R2_PUBLIC_BASE_URL=https://pub-xxx.r2.dev
     ```
   - Without public URL, downloads will proxy through your backend.

---

## Step 5 — Render: Backend API

### Option A — Using render.yaml (recommended)

1. Render dashboard → New → Blueprint
2. Connect GitHub repo `nicolasmoreno2914/video_gen_ai`
3. Select branch `staging`
4. Render reads `render.yaml` and creates both services
5. Go to each service → Environment → add all secret vars (see list below)
6. Deploy

### Option B — Manual via dashboard

1. New → Web Service
2. Connect GitHub repo → branch `staging`
3. Runtime: **Docker**
4. Dockerfile path: `./backend/Dockerfile`
5. Docker context: `./backend`
6. Start command: `node dist/main`
7. Health check path: `/health`
8. Plan: Standard (needs RAM for Chromium/FFmpeg)

### Environment variables for API service

Set these in Render dashboard (never in render.yaml):

```
NODE_ENV=staging
PORT=10000
API_SECRET=<generate a strong random string>
CORS_ORIGIN=https://YOUR_APP.pages.dev,http://localhost:5173

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from Supabase>
SUPABASE_JWT_SECRET=<from Supabase>
SUPABASE_ANON_KEY=<from Supabase>

DATABASE_URL=<from Supabase connection string>
REDIS_URL=<from Upstash rediss://...>

OPENAI_API_KEY=<your key>
OPENAI_MODEL=gpt-4o
OPENAI_IMAGE_MODEL=dall-e-3
OPENAI_IMAGE_SIZE=1792x1024
OPENAI_IMAGE_QUALITY=standard

ELEVENLABS_API_KEY=<your key>
ELEVENLABS_DEFAULT_VOICE_ID=<your voice ID>
ELEVENLABS_MODEL_ID=eleven_multilingual_v2

STORAGE_DRIVER=r2
STORAGE_BASE_PATH=/tmp/video-engine
R2_ACCOUNT_ID=<from Cloudflare>
R2_ACCESS_KEY_ID=<from R2 token>
R2_SECRET_ACCESS_KEY=<from R2 token>
R2_BUCKET=video-engine-staging
R2_PUBLIC_BASE_URL=https://pub-xxx.r2.dev

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
```

### After first deploy — run migrations

In Render dashboard → API service → Shell (or via one-off job):

```bash
npm run migration:run
```

---

## Step 6 — Render: Background Worker

### Manual via dashboard

1. New → Background Worker
2. Connect same GitHub repo → branch `staging`
3. Runtime: **Docker**
4. Dockerfile path: `./backend/Dockerfile`
5. Docker context: `./backend`
6. Start command: `node dist/worker`
7. Plan: Standard (needs RAM for FFmpeg + Chromium rendering)

### Environment variables

Copy **all the same vars as the API service**, plus:

```
QUEUE_CONCURRENCY=1    # keep at 1 on Render Standard to avoid OOM during render
```

> The worker does NOT need `PORT`, `CORS_ORIGIN`, or `FRONTEND_URL`.

---

## Step 7 — Cloudflare Pages: Frontend

1. Cloudflare dashboard → Pages → Create a project
2. Connect GitHub → select `nicolasmoreno2914/video_gen_ai`
3. Branch: `staging`
4. **Build settings:**
   - Framework preset: None (or Vite)
   - Root directory: `frontend`
   - Build command: `npm run build`
   - Output directory: `dist`
5. **Environment variables** (add in Pages → Settings → Environment variables):
   ```
   VITE_API_URL=https://video-engine-api-staging.onrender.com
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=<from Supabase>
   VITE_SKIP_AUTH=false
   ```
6. Deploy → copy the generated URL (e.g. `https://video-engine-ia-staging.pages.dev`)
7. Go back to **Supabase → Auth → URL Configuration** and add this URL

---

## Step 8 — Update CORS after deploy

Once you have the Cloudflare Pages URL, update the API service in Render:

```
CORS_ORIGIN=https://video-engine-ia-staging.pages.dev,http://localhost:5173
```

Redeploy the API service.

---

## Step 9 — GitHub Deployment Flow

```bash
# Daily work
git checkout development
# ... make changes ...
git push origin development

# Deploy to staging
git checkout staging
git merge development
git push origin staging
# → Render and Cloudflare Pages auto-deploy from staging branch
```

---

## Post-Deploy Checklist

- [ ] `GET /health` returns `{ status: "ok", env: "staging" }`
- [ ] `GET /health/deep` returns DB and Redis as `ok`
- [ ] Frontend loads at Cloudflare Pages URL
- [ ] Login with Supabase works
- [ ] Institution loads in `/settings`
- [ ] API Key created in `/settings`
- [ ] `GET /api/external/auth-test` with API key returns 200
- [ ] `POST /api/external/videos/create` with `test_only: true` returns 200
- [ ] `POST /api/external/videos/batch-create` with `test_only: true` returns 200
- [ ] Real video job created and visible in `/videos`
- [ ] Worker processes job (check Render worker logs)
- [ ] File appears in R2 bucket after render
- [ ] Video downloadable from frontend
- [ ] `/costs` loads and shows institution data
- [ ] `/api/costs/summary` without token returns 401

---

## Troubleshooting

### Worker not picking up jobs
- Check `REDIS_URL` is identical in both API and Worker services
- Check Upstash dashboard → Data Browser to confirm jobs exist

### Database connection failed
- Verify `DATABASE_URL` uses the **pooler** connection string from Supabase (port 5432)
- SSL is enabled automatically for `NODE_ENV != development`
- Run `npm run migration:run` if tables don't exist

### Chromium / Puppeteer fails
- Confirm Dockerfile installs `chromium` and `libgbm1`
- Confirm `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` is set in Worker

### R2 upload fails
- Confirm `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` are correct
- Test with AWS CLI: `aws s3 ls s3://your-bucket --endpoint-url https://ACCOUNT_ID.r2.cloudflarestorage.com`

### CORS errors in browser
- Add the exact Cloudflare Pages URL to `CORS_ORIGIN` in Render API env vars
- Redeploy API after updating

---

## What You Must Do Manually

| Step | Action | Where |
|------|--------|-------|
| 1 | Create `staging` branch and push | GitHub |
| 2 | Copy Supabase credentials | Supabase dashboard |
| 3 | Copy Supabase DATABASE_URL | Supabase → Settings → Database |
| 4 | Configure Supabase Auth redirect URLs | Supabase → Auth → URL Config |
| 5 | Create Upstash Redis database | upstash.com |
| 6 | Create Cloudflare R2 bucket | Cloudflare dashboard |
| 7 | Create R2 API token with read/write | Cloudflare → R2 → API Tokens |
| 8 | Connect GitHub to Render → deploy API | render.com |
| 9 | Connect GitHub to Render → deploy Worker | render.com |
| 10 | Run `npm run migration:run` on API | Render shell |
| 11 | Connect GitHub to Cloudflare Pages → deploy frontend | Cloudflare Pages |
| 12 | Set env vars in each service | Render + Cloudflare |
| 13 | Update CORS_ORIGIN with final Pages URL | Render API env vars |
| 14 | Update Supabase redirect URLs with Pages URL | Supabase Auth |
| 15 | Run post-deploy checklist | Browser + curl |
