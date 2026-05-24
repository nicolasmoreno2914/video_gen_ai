# Deploy Videogen en VPS Contabo — Guía de Producción

> **Dominio:** `https://videosb.nomaddi.com`  
> **Stack:** Ubuntu 22.04 · Node.js 20 · PM2 · Nginx · Certbot · Redis local  
> **Puerto interno:** `3001` (Nginx hace proxy público → `localhost:3001`)  
> **Última actualización:** Mayo 2026

---

## Tabla de Contenidos

1. [Arquitectura](#1-arquitectura)
2. [Requisitos del VPS](#2-requisitos-del-vps)
3. [Preparación del servidor](#3-preparación-del-servidor)
4. [Instalar Node.js, PM2, Redis, FFmpeg y Chromium](#4-instalar-nodejs-pm2-redis-ffmpeg-y-chromium)
5. [Instalar Nginx y Certbot](#5-instalar-nginx-y-certbot)
6. [Clonar el repositorio](#6-clonar-el-repositorio)
7. [Configurar variables de entorno](#7-configurar-variables-de-entorno)
8. [Crear directorios de storage](#8-crear-directorios-de-storage)
9. [Instalar dependencias y compilar](#9-instalar-dependencias-y-compilar)
10. [Ejecutar migraciones de base de datos](#10-ejecutar-migraciones-de-base-de-datos)
11. [Iniciar con PM2](#11-iniciar-con-pm2)
12. [Configurar Nginx](#12-configurar-nginx)
13. [Obtener SSL con Certbot](#13-obtener-ssl-con-certbot)
14. [Smoke test y validación](#14-smoke-test-y-validación)
15. [Test mode — validar flujo Cursia ↔ Videogen](#15-test-mode--validar-flujo-cursia--videogen)
16. [Actualizaciones de código](#16-actualizaciones-de-código)
17. [Monitoreo y logs](#17-monitoreo-y-logs)
18. [Storage temporal — gestión y limpieza](#18-storage-temporal--gestión-y-limpieza)
19. [Seguridad](#19-seguridad)
20. [Checklist pre-deploy](#20-checklist-pre-deploy)
21. [Riesgos y pendientes críticos](#21-riesgos-y-pendientes-críticos)
22. [Troubleshooting](#22-troubleshooting)
23. [Rollback](#23-rollback)

---

## 1. Arquitectura

```
Internet
    │
    ▼
DNS: videosb.nomaddi.com → IP VPS Contabo
    │
    ▼
Nginx :443 (SSL, reverse proxy)
    │
    ├── GET/POST /api/*      → localhost:3001  (videogen-api  — PM2)
    ├── GET /health          → localhost:3001  (sin logs)
    └── GET /api/v1/temp-files/:id/download → localhost:3001 (stream MP4)

localhost:3001
    │   NestJS API (PM2: videogen-api)
    │   - Recibe batch requests de Cursia (HMAC firmado)
    │   - Encola jobs en Redis via BullMQ
    │   - Sirve download URLs firmadas de MP4 temporales
    │
    └── Redis :6379 (local, sin contraseña en setup básico)
              │
              └── BullMQ Worker (PM2: videogen-worker)
                      - Procesa jobs de generación de video
                      - FFmpeg + Chromium/Puppeteer
                      - Guarda MP4 en /var/www/videogen/storage/temp-videos/
                      - Emite events → CursiaBatchesService → callback a Cursia

Supabase (externo, PostgreSQL)
    - cursia_batches, cursia_items, temp_files
    - video_jobs, institutions, etc.

Cursia backend (externo)
    https://api.cursia.nomaddi.com
    - Envía batch requests (HMAC-SHA256)
    - Recibe callbacks firmados de Videogen
    - Descarga MP4 via download_url temporal
    - Sube video al YouTube del usuario
```

### ¿Qué hace Videogen?
- Recibe solicitudes de batch de videos de Cursia ✅
- Genera MP4 (con IA: guion, audio, slides, render) ✅
- Guarda MP4 temporalmente en el VPS (TTL 3h) ✅
- Entrega download_url firmada a Cursia via callback ✅
- Limpieza automática de archivos expirados ✅

### ¿Qué NO hace Videogen?
- No sube videos a YouTube ❌
- No maneja tokens OAuth de usuarios ❌
- No guarda MP4 permanentemente ❌
- No retorna base64 ❌

---

## 2. Requisitos del VPS

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| CPU | 4 vCPU | 6+ vCPU |
| RAM | 8 GB | 16 GB |
| Disco SSD | 80 GB | 160 GB |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Swap | 4 GB | 8 GB |

> **Por qué tanta RAM:** Puppeteer (Chromium headless) + FFmpeg pueden consumir 2-4 GB durante el render de un video de 7 minutos. Con `QUEUE_CONCURRENCY=1` se procesan de a uno, pero el pico de RAM puede superar 4 GB. Sin swap o con poca RAM, el OOM killer mata el worker.

---

## 3. Preparación del servidor

### 3.1 Conectar y actualizar

```bash
ssh root@<IP_CONTABO>
apt update && apt upgrade -y
apt install -y curl wget git unzip htop ufw fail2ban
```

### 3.2 Crear usuario dedicado

```bash
adduser videogen
usermod -aG sudo videogen

# Copiar claves SSH
mkdir -p /home/videogen/.ssh
cp ~/.ssh/authorized_keys /home/videogen/.ssh/
chown -R videogen:videogen /home/videogen/.ssh
chmod 700 /home/videogen/.ssh && chmod 600 /home/videogen/.ssh/authorized_keys
```

### 3.3 Configurar swap

```bash
# Si el VPS tiene menos de 16 GB RAM
fallocate -l 8G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Verificar
free -h
```

### 3.4 Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh          # Puerto 22
ufw allow 80/tcp       # HTTP (Certbot challenge)
ufw allow 443/tcp      # HTTPS
ufw deny 6379          # Redis NO debe ser público
ufw enable
ufw status
```

### 3.5 Fail2ban (protección SSH)

```bash
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 3600
findtime = 600
EOF
systemctl enable fail2ban && systemctl restart fail2ban
```

---

## 4. Instalar Node.js, PM2, Redis, FFmpeg y Chromium

```bash
# Cambiar al usuario videogen
su - videogen

# ── Node.js 20 ────────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # debe ser 20.x
npm --version

# ── PM2 ──────────────────────────────────────────────────────
sudo npm install -g pm2
pm2 --version

# ── Redis ─────────────────────────────────────────────────────
sudo apt install -y redis-server

# Configurar Redis para solo escuchar en localhost
sudo sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf
sudo sed -i 's/^# maxmemory .*/maxmemory 512mb/' /etc/redis/redis.conf
sudo sed -i 's/^# maxmemory-policy .*/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf

sudo systemctl enable redis-server
sudo systemctl restart redis-server

# Verificar Redis
redis-cli ping    # debe responder PONG

# ── FFmpeg ────────────────────────────────────────────────────
sudo apt install -y ffmpeg
ffmpeg -version

# ── Chromium (para Puppeteer/renderizado de slides) ──────────
sudo apt install -y chromium-browser

# Verificar Chromium
chromium-browser --version
which chromium-browser   # anota la ruta — va en PUPPETEER_EXECUTABLE_PATH
```

> **Nota sobre Chromium:** En Ubuntu 22.04 el binario puede estar en `/usr/bin/chromium-browser` o `/usr/bin/chromium`. Verifica con `which chromium-browser` y usa esa ruta en `PUPPETEER_EXECUTABLE_PATH`.

---

## 5. Instalar Nginx y Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx
sudo systemctl start nginx
nginx -v
```

---

## 6. Clonar el repositorio

```bash
# Como usuario videogen
sudo mkdir -p /var/www/videogen
sudo chown videogen:videogen /var/www/videogen

cd /var/www/videogen
git clone https://github.com/TU_ORG/video-engine-ia.git .

# Verificar que el backend está presente
ls backend/src/main.ts

# Directorios de logs PM2
sudo mkdir -p /var/log/videogen
sudo chown videogen:videogen /var/log/videogen
```

---

## 7. Configurar variables de entorno

### 7.1 Crear el .env desde el ejemplo

```bash
cp /var/www/videogen/backend/_env.example \
   /var/www/videogen/backend/.env

# Permisos seguros
chmod 600 /var/www/videogen/backend/.env

nano /var/www/videogen/backend/.env
```

### 7.2 Valores críticos a configurar

```env
# Puerto producción Contabo
PORT=3001
NODE_ENV=production

# Redis local (sin contraseña en setup básico)
REDIS_URL=redis://127.0.0.1:6379

# Supabase — base de datos de Videogen
DATABASE_URL=postgresql://postgres:<PASSWORD>@db.<PROJECT>.supabase.co:5432/postgres
SUPABASE_URL=https://<PROJECT>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_ANON_KEY=<anon_key>
SUPABASE_JWT_SECRET=<jwt_secret>

# Storage temporal de MP4
TEMP_VIDEO_DIR=/var/www/videogen/storage/temp-videos
STORAGE_BASE_PATH=/var/www/videogen/storage
PUBLIC_API_URL=https://videosb.nomaddi.com

# Secretos — generar con:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
TEMP_DOWNLOAD_SECRET=<32-hex-chars>
VIDEOGEN_SHARED_SECRET=<32-hex-chars>
VIDEOGEN_WEBHOOK_SECRET=<32-hex-chars>
API_SECRET=<random>

# CORS — dominios de Cursia
CORS_ORIGIN=https://api.cursia.nomaddi.com,https://cursia.nomaddi.com

# Puppeteer — ruta de Chromium en el sistema
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# OpenAI
OPENAI_API_KEY=<key>
OPENAI_MODEL=gpt-4o

# ElevenLabs
ELEVENLABS_API_KEY=<key>
ELEVENLABS_DEFAULT_VOICE_ID=<voice_id>

# Test mode — true para validar sin consumir créditos
VIDEOGEN_TEST_MODE=false
```

> ⚠️ **IMPORTANTE — Redis password con caracteres especiales:**  
> Si en el futuro agregas contraseña a Redis y contiene `&`, debes codificarlo como `%26` en la URL.  
> `❌ REDIS_URL=redis://:pass&word@127.0.0.1:6379`  
> `✅ REDIS_URL=redis://:pass%26word@127.0.0.1:6379`

### 7.3 Generar los secretos

```bash
# Ejecutar 3 veces — uno por secreto
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 8. Crear directorios de storage

```bash
mkdir -p /var/www/videogen/storage/temp-videos
mkdir -p /var/www/videogen/storage/jobs
mkdir -p /var/www/videogen/storage/logs

# Verificar permisos
ls -la /var/www/videogen/storage/
```

---

## 9. Instalar dependencias y compilar

```bash
cd /var/www/videogen/backend

# Instalar dependencias de producción
npm ci --omit=optional

# Compilar TypeScript
npm run build

# Verificar que dist/ fue generado
ls dist/main.js dist/worker.js
```

Si el build falla con errores de TypeScript, revisa el output y corrígelo antes de continuar.

---

## 10. Ejecutar migraciones de base de datos

Las migraciones crean las tablas necesarias en Supabase:
- `cursia_batches` — batches de videos de Cursia
- `cursia_items` — items individuales por batch
- `temp_files` — registro de MP4 temporales (no guarda el archivo en DB)
- Y todas las tablas anteriores del sistema

```bash
cd /var/www/videogen/backend
NODE_ENV=production npm run migration:run
```

> Las migraciones son **idempotentes**: si ya existen las tablas, no hace nada. Seguro ejecutar más de una vez.

Verificar en Supabase → Table Editor que existen:
- `cursia_batches`
- `cursia_items`
- `temp_files`

---

## 11. Iniciar con PM2

```bash
cd /var/www/videogen

# Primera vez — iniciar ambos procesos
pm2 start ecosystem.config.js --env production

# Guardar configuración para autoarranque
pm2 save

# Configurar autoarranque al reiniciar el VPS
pm2 startup
# Copia y ejecuta el comando que PM2 te muestre

# Verificar estado
pm2 status
```

Salida esperada:
```
┌─────┬──────────────────┬─────────┬─────────┬──────────┐
│ id  │ name             │ mode    │ status  │ memory   │
├─────┼──────────────────┼─────────┼─────────┼──────────┤
│ 0   │ videogen-api     │ fork    │ online  │ 150 MB   │
│ 1   │ videogen-worker  │ fork    │ online  │ 200 MB   │
└─────┴──────────────────┴─────────┴─────────┴──────────┘
```

Verificar que la API responde internamente:
```bash
curl http://127.0.0.1:3001/health
# {"status":"ok","env":"production","version":"1.0.0"}
```

---

## 12. Configurar Nginx

```bash
# Copiar configuración
sudo cp /var/www/videogen/nginx/videosb.nomaddi.com.conf \
        /etc/nginx/sites-available/videosb.nomaddi.com

# Activar
sudo ln -s /etc/nginx/sites-available/videosb.nomaddi.com \
           /etc/nginx/sites-enabled/videosb.nomaddi.com

# Deshabilitar el default si existe
sudo rm -f /etc/nginx/sites-enabled/default

# Verificar sintaxis
sudo nginx -t

# Aplicar
sudo systemctl reload nginx
```

Verificar (antes de SSL, solo HTTP):
```bash
curl -I http://videosb.nomaddi.com/health
# 301 → HTTPS (redirección OK)
```

---

## 13. Obtener SSL con Certbot

> Antes de este paso: el DNS de `videosb.nomaddi.com` debe apuntar a la IP del VPS.

```bash
# Verificar DNS
dig videosb.nomaddi.com A +short
# Debe mostrar la IP del VPS

# Obtener certificado
sudo certbot --nginx -d videosb.nomaddi.com \
  --email tu@email.com \
  --agree-tos \
  --non-interactive

# Certbot modifica /etc/nginx/sites-available/videosb.nomaddi.com automáticamente

# Verificar renovación automática
sudo certbot renew --dry-run
```

Verificar HTTPS:
```bash
curl https://videosb.nomaddi.com/health
# {"status":"ok","env":"production","version":"1.0.0"}
```

---

## 14. Smoke test y validación

### Health básico

```bash
curl https://videosb.nomaddi.com/health
```

### Health deep (DB + Redis)

```bash
curl https://videosb.nomaddi.com/health/deep
```

Respuesta esperada:
```json
{
  "status": "ok",
  "env": "production",
  "services": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### Test con API Key

```bash
# Sin autenticación — debe responder 401
curl https://videosb.nomaddi.com/api/videos

# Con API Key — debe responder 200 o lista vacía
curl https://videosb.nomaddi.com/api/videos \
  -H "x-api-key: TU_API_SECRET"
```

### Endpoints de desarrollo bloqueados en producción

```bash
# Debe responder 404 (bloqueado por NODE_ENV=production)
curl https://videosb.nomaddi.com/api/dev/jobs
```

---

## 15. Test mode — validar flujo Cursia ↔ Videogen

Activa `VIDEOGEN_TEST_MODE=true` en el `.env` para probar sin consumir créditos de OpenAI/ElevenLabs.

### ¿Qué hace el test mode?

- El batch se crea y se procesa instantáneamente
- Cada item se marca como `generated` en segundos
- Se envían callbacks reales a `callback_url` firmados con HMAC
- La `download_url` redirige a un video de muestra público
- No se genera ningún video real, no se consumen APIs externas

### Script de prueba manual

```bash
SECRET="tu_videogen_shared_secret"
TIMESTAMP=$(date +%s)
BODY=$(cat <<'JSON'
{
  "request_id": "test_manual_001",
  "course_id": "42",
  "callback_url": "https://webhook.site/TU-UUID",
  "options": { "language": "es" },
  "videos": [
    {
      "chapter_number": 1,
      "title": "Introducción al curso",
      "script": "Este es el guion del capítulo introductorio.",
      "duration_hint_seconds": 60
    }
  ]
}
JSON
)

SIG=$(echo -n "${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -s -X POST https://videosb.nomaddi.com/api/v1/video-batches \
  -H "Content-Type: application/json" \
  -H "X-Cursia-Request-ID: test_manual_001" \
  -H "X-Cursia-Timestamp: $TIMESTAMP" \
  -H "X-Cursia-Signature: $SIG" \
  -d "$BODY" | python3 -m json.tool
```

Respuesta esperada:
```json
{
  "success": true,
  "batch_id": "a1b2c3d4-...",
  "status": "queued",
  "estimated_seconds": 2,
  "items": [
    { "chapter_number": 1, "item_id": "e5f6...", "status": "queued" }
  ]
}
```

Unos segundos después Videogen POST-ea a `callback_url` con el evento `video.generated`.

### Verificar en webhook.site

1. Ve a [webhook.site](https://webhook.site) y copia tu UUID
2. Úsalo como `callback_url` en el script
3. Verifica que llega:
   - `video.generated` con `file_url` y `expires_at`
   - `batch.completed` con `status: "completed"`

---

## 16. Actualizaciones de código

### Opción A — Script automático

```bash
bash /var/www/videogen/scripts/deploy.sh
```

### Opción B — Manual paso a paso

```bash
cd /var/www/videogen
git pull origin main

cd backend
npm ci --omit=optional
npm run build

# Solo si hay migraciones nuevas
npm run migration:run

cd /var/www/videogen
pm2 reload ecosystem.config.js --env production

# Verificar
curl https://videosb.nomaddi.com/health
pm2 status
```

### GitHub Actions (manual)

Desde GitHub → Actions → **"Deploy Videogen → Contabo (manual)"** → **Run workflow**

Requiere configurar los secrets en el repo (ver `.github/workflows/deploy-videogen.yml`).

---

## 17. Monitoreo y logs

### Comandos PM2

```bash
# Estado general
pm2 status

# Logs en tiempo real
pm2 logs videogen-api
pm2 logs videogen-worker

# Monitor interactivo CPU/RAM
pm2 monit

# Últimas N líneas
pm2 logs videogen-api --lines 100 --nostream
```

### Logs en disco

```
/var/log/videogen/api-out.log      → stdout del API
/var/log/videogen/api-error.log    → stderr del API
/var/log/videogen/worker-out.log   → stdout del worker
/var/log/videogen/worker-error.log → stderr del worker
```

### Uso de disco y memoria

```bash
df -h                              # espacio total
du -sh /var/www/videogen/storage/  # espacio de videos
pm2 status                         # RAM por proceso
free -h                            # RAM total y swap
```

### UptimeRobot (recomendado)

Crear monitor en [uptimerobot.com](https://uptimerobot.com):
- Tipo: HTTP(s)
- URL: `https://videosb.nomaddi.com/health`
- Intervalo: 5 minutos
- Alerta: email

---

## 18. Storage temporal — gestión y limpieza

### Cómo funciona

1. Videogen genera un MP4 → lo copia a `/var/www/videogen/storage/temp-videos/<uuid>.mp4`
2. Crea un registro en la tabla `temp_files` con `expires_at = now() + 3h`
3. Genera una URL firmada: `https://videosb.nomaddi.com/api/v1/temp-files/<uuid>/download?exp=<ts>&sig=<hmac>`
4. Cursia tiene 3 horas para descargar el MP4
5. Cada hora un cron job limpia los archivos y registros expirados

### Limpieza manual de emergencia

```bash
# Ver cuánto ocupa
du -sh /var/www/videogen/storage/temp-videos/

# Eliminar archivos de más de 4 horas
find /var/www/videogen/storage/temp-videos/ -name "*.mp4" -mmin +240 -delete

# Ver cuántos quedan
ls /var/www/videogen/storage/temp-videos/ | wc -l
```

### Alerta de disco

```bash
# Agregar al crontab del usuario videogen
crontab -e
# Agregar:
0 * * * * df /var/www/videogen/storage | awk 'NR==2{if($5+0>80) print "ALERTA: disco al "$5" en /storage"}' >> /var/log/videogen/disk-alert.log
```

---

## 19. Seguridad

| Capa | Mecanismo |
|------|-----------|
| Requests Cursia→Videogen | HMAC-SHA256 (`VIDEOGEN_SHARED_SECRET`), replay ±5min |
| Callbacks Videogen→Cursia | HMAC-SHA256 (`VIDEOGEN_WEBHOOK_SECRET`) |
| Download URLs | HMAC-SHA256 (`TEMP_DOWNLOAD_SECRET`), TTL 3h |
| API interna (frontend) | API Key (`API_SECRET`) via header `x-api-key` |
| Dev endpoints | 404 en `NODE_ENV=production` |
| Firewall | Solo puertos 22, 80, 443 abiertos |
| Redis | Bind a `127.0.0.1`, no expuesto públicamente |
| .env | `chmod 600` |
| PM2 logs | Sin secretos en stdout |

### Rotar secretos

Si un secreto se filtra:
1. Generar nuevo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Actualizar en `.env`
3. Actualizar en Cursia si es `SHARED_SECRET` o `WEBHOOK_SECRET`
4. `pm2 reload ecosystem.config.js --env production`

---

## 20. Checklist pre-deploy

```
CÓDIGO
[ ] Build local pasa sin errores (npm run build)
[ ] TypeScript sin errores críticos (npx tsc --noEmit)
[ ] No hay secretos en el repositorio
[ ] DevController devuelve 404 en NODE_ENV=production
[ ] _env.example actualizado con todas las vars

SERVIDOR
[ ] VPS Contabo provisionado (Ubuntu 22.04, 8+ GB RAM)
[ ] Usuario videogen creado, sin contraseña root en uso
[ ] Firewall: solo 22, 80, 443 abiertos; 6379 bloqueado
[ ] Swap configurado (4-8 GB)
[ ] Node.js 20.x instalado
[ ] PM2 instalado globalmente
[ ] Redis instalado y escuchando en 127.0.0.1:6379
[ ] FFmpeg instalado
[ ] Chromium instalado y verificado (ruta anotada)
[ ] Nginx instalado y activo
[ ] Certbot instalado

CONFIGURACIÓN
[ ] .env creado en /var/www/videogen/backend/.env
[ ] chmod 600 aplicado al .env
[ ] PORT=3001 en .env
[ ] NODE_ENV=production en .env
[ ] REDIS_URL=redis://127.0.0.1:6379 en .env
[ ] DATABASE_URL de Supabase correcta en .env
[ ] PUBLIC_API_URL=https://videosb.nomaddi.com en .env
[ ] TEMP_VIDEO_DIR=/var/www/videogen/storage/temp-videos en .env
[ ] TEMP_DOWNLOAD_SECRET generado con 32+ chars en .env
[ ] VIDEOGEN_SHARED_SECRET generado con 32+ chars en .env
[ ] VIDEOGEN_WEBHOOK_SECRET generado con 32+ chars en .env
[ ] PUPPETEER_EXECUTABLE_PATH correcto en .env
[ ] CORS_ORIGIN con dominios de Cursia en .env

STORAGE Y DB
[ ] /var/www/videogen/storage/temp-videos/ existe
[ ] /var/log/videogen/ existe con permisos correctos
[ ] Migraciones ejecutadas (npm run migration:run)
[ ] Tablas cursia_batches, cursia_items, temp_files en Supabase

NETWORKING
[ ] DNS videosb.nomaddi.com → IP del VPS (verificado con dig)
[ ] Nginx config copiada y activada
[ ] sudo nginx -t pasa sin errores
[ ] Certbot SSL obtenido y activo
[ ] certbot renew --dry-run OK

VALIDACIÓN
[ ] curl https://videosb.nomaddi.com/health → 200
[ ] curl https://videosb.nomaddi.com/health/deep → database:ok, redis:ok
[ ] curl /api/dev/jobs → 404 (Dev bloqueado)
[ ] Test mode: batch de prueba enviado → callback recibido en webhook.site
[ ] PM2 status: ambos procesos online
[ ] pm2 startup configurado (autoarranque)

CURSIA
[ ] Cursia tiene VIDEOGEN_API_URL=https://videosb.nomaddi.com
[ ] Cursia tiene VIDEOGEN_SHARED_SECRET (mismo valor que Videogen)
[ ] Cursia tiene VIDEOGEN_WEBHOOK_SECRET (mismo valor que Videogen)
[ ] Endpoint de callback en Cursia existe y responde 2xx
```

---

## 21. Riesgos y pendientes críticos

### 🔴 CRÍTICO — `processProductionBatch` no está conectado

**Estado:** La función existe pero es un stub con `TODO`.

**Impacto:** Con `VIDEOGEN_TEST_MODE=false`, los batches de Cursia entran en estado `queued` y nunca se procesan. Los videos no se generan.

**Workaround actual:** Usar `VIDEOGEN_TEST_MODE=true` para todas las pruebas de integración Cursia ↔ Videogen. El flujo completo (request → callback → download_url) funciona correctamente en test mode.

**Para resolver en sprint siguiente:**
1. En `CursiaBatchesService.processProductionBatch()`, inyectar `VideosService`
2. Por cada `CursiaItem`, crear un `VideoJob` via `VideosService.create()`
3. Guardar el `video_job_id` en el `CursiaItem`
4. `VideoProcessor` (worker) debe emitir `cursia.job.completed` o `cursia.job.failed` al terminar
5. Los `@OnEvent` en `CursiaBatchesService` ya están listos para recibir esos eventos

**Mientras tanto:** No despliegues con `VIDEOGEN_TEST_MODE=false` si Cursia espera videos reales.

---

### 🟡 MEDIO — Storage temporal en el mismo disco del OS

**Estado:** Los MP4 temporales van a `/var/www/videogen/storage/temp-videos/`.

**Riesgo:** Si el disco del VPS se llena, el servidor puede volverse inestable.

**Mitigación:** Monitorear el espacio en disco. La limpieza automática corre cada hora. Si el volumen crece demasiado, considera separar el storage en un volumen adicional de Contabo o migrar a R2 (futuro).

---

### 🟡 MEDIO — Redis sin contraseña

**Estado:** Setup básico sin password para simplificar el deploy inicial.

**Riesgo:** Redis solo escucha en `127.0.0.1` (firewall bloquea puerto 6379 externamente), así que el riesgo es bajo. Pero si en el futuro se abre el puerto o se cambia el bind, queda expuesto.

**Recomendación futura:** Agregar `requirepass <password>` en `/etc/redis/redis.conf` y actualizar `REDIS_URL=redis://:password@127.0.0.1:6379`.

---

### 🟡 BAJO — CORS configurado solo para Cursia

**Estado:** `CORS_ORIGIN=https://api.cursia.nomaddi.com,https://cursia.nomaddi.com`

Si en el futuro hay un frontend de Eduvia que llame directamente a Videogen, hay que agregar su dominio aquí.

---

## 22. Troubleshooting

### El servidor no responde (curl timeout o connection refused)

```bash
# 1. ¿PM2 está corriendo?
pm2 status

# 2. ¿La API escucha en 3001?
ss -tlnp | grep 3001

# 3. Ver logs de arranque
pm2 logs videogen-api --lines 50 --nostream

# 4. Si el proceso está online pero no responde
curl http://127.0.0.1:3001/health
```

### Error 502 Bad Gateway en Nginx

```bash
# Nginx no puede llegar al backend
# 1. Verificar que el API corre en 3001
ss -tlnp | grep 3001

# 2. Verificar config de Nginx
sudo nginx -t
sudo systemctl status nginx

# 3. Reiniciar Nginx
sudo systemctl reload nginx
```

### El worker no procesa jobs

```bash
pm2 logs videogen-worker --lines 100 --nostream

# Verificar Redis
redis-cli ping
redis-cli info clients

# Reiniciar worker
pm2 restart videogen-worker
```

### Crash loop del API (reinicia repetidamente)

```bash
pm2 logs videogen-api --lines 200 --nostream

# Causas comunes:
# - DATABASE_URL incorrecta o Supabase no accesible
# - REDIS_URL con & no codificado como %26
# - TEMP_VIDEO_DIR no existe o sin permisos
# - PUPPETEER_EXECUTABLE_PATH apuntando a binario que no existe

# Verificar Supabase
node -e "const {Client}=require('pg'); const c=new Client(process.env.DATABASE_URL); c.connect().then(()=>{console.log('DB OK');c.end()}).catch(e=>console.error('DB FAIL:',e.message))" 

# Verificar Redis
redis-cli ping
```

### SSL expirado

```bash
sudo certbot renew
sudo systemctl reload nginx
```

### Disco lleno

```bash
df -h
du -sh /var/www/videogen/storage/temp-videos/

# Limpieza manual inmediata
find /var/www/videogen/storage/temp-videos/ -name "*.mp4" -mmin +180 -delete

# Limpieza de imágenes Docker si aplica
docker system prune -f 2>/dev/null || true
```

### HMAC inválido desde Cursia

Causas comunes:
- `VIDEOGEN_SHARED_SECRET` diferente en Cursia y Videogen
- El body en Cursia se serializa diferente (espacios, orden de keys)
- El timestamp de Cursia está desincronizado > 5 minutos del VPS

```bash
# Verificar hora del VPS
date -u

# Si hay desfase de más de 5 minutos, sincronizar NTP
sudo timedatectl set-ntp true
```

---

## 23. Rollback

### Rollback de código

```bash
cd /var/www/videogen

# Ver commits disponibles
git log --oneline -10

# Volver al commit anterior
git checkout <commit-hash>

# Reconstruir
cd backend && npm run build

# Recargar PM2
cd /var/www/videogen
pm2 reload ecosystem.config.js --env production

# Verificar
curl https://videosb.nomaddi.com/health
```

### Rollback de migraciones

TypeORM soporta `migration:revert` para deshacer la última migración:

```bash
cd /var/www/videogen/backend
NODE_ENV=production npm run migration:revert
```

> ⚠️ Esto deshace la migración más reciente. Úsalo solo si sabes exactamente qué migración revertir.

---

*Videogen — Motor de generación de videos educativos para Cursia / Eduvia*  
*Dominio: https://videosb.nomaddi.com | Mayo 2026*
