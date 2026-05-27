# Guía de Despliegue en Producción — VPS Contabo
## Video Engine IA / Eduvia

> **Fecha:** Mayo 2026  
> **VPS:** Contabo (Ubuntu 22.04 LTS)  
> **Dominio:** `videosb.nomaddi.com`  
> **Estrategia:** Docker Compose + Nginx + Certbot

---

## Tabla de Contenidos

1. [Arquitectura de Producción](#1-arquitectura-de-producción)
2. [Requisitos del VPS](#2-requisitos-del-vps)
3. [Preparación inicial del servidor](#3-preparación-inicial-del-servidor)
4. [Instalar dependencias del sistema](#4-instalar-dependencias-del-sistema)
5. [Clonar el repositorio](#5-clonar-el-repositorio)
6. [Variables de entorno](#6-variables-de-entorno)
7. [Docker Compose — arquitectura](#7-docker-compose--arquitectura)
8. [Primera construcción y arranque](#8-primera-construcción-y-arranque)
9. [Nginx — reverse proxy](#9-nginx--reverse-proxy)
10. [SSL con Certbot](#10-ssl-con-certbot)
11. [DNS](#11-dns)
12. [Migraciones de base de datos](#12-migraciones-de-base-de-datos)
13. [CORS](#13-cors)
14. [Health check y smoke test](#14-health-check-y-smoke-test)
15. [Checklist post-despliegue](#15-checklist-post-despliegue)
16. [Monitoreo](#16-monitoreo)
17. [Seguridad](#17-seguridad)
18. [Backups](#18-backups)
19. [Actualizaciones de código](#19-actualizaciones-de-código)
20. [Gestión del almacenamiento de videos](#20-gestión-del-almacenamiento-de-videos)
21. [Troubleshooting](#21-troubleshooting)
22. [Alternativa: PM2 sin Docker](#22-alternativa-pm2-sin-docker)
23. [Variables de entorno completas — referencia](#23-variables-de-entorno-completas--referencia)
24. [Contacto y recursos](#24-contacto-y-recursos)

---

## 1. Arquitectura de Producción

```
Internet
    │
    ▼
Cloudflare DNS (videosb.nomaddi.com → IP VPS)
    │
    ▼
Nginx :443 (SSL, reverse proxy)
    │
    ├─▶ :3500  videogen-api   (NestJS HTTP — Docker)
    │
    └─▶ (interno) videogen-worker (BullMQ — Docker)
                       │
                       ├─▶ videogen-redis :6379 (Docker)
                       │
                       └─▶ Supabase (PostgreSQL externo)
                       └─▶ OpenAI / ElevenLabs / Puppeteer (externos)

Almacenamiento local:
  /var/www/video-engine/storage/   ← volumen Docker bind-mount
```

**Componentes:**

| Servicio | Tecnología | Puerto | Función |
|---|---|---|---|
| `videogen-api` | NestJS (Docker) | 3500 (interno) | API HTTP REST |
| `videogen-worker` | NestJS worker (Docker) | — | Generación de videos con BullMQ |
| `videogen-redis` | Redis 7 Alpine (Docker) | 6379 (interno) | Cola de jobs |
| Nginx | Sistema host | 80, 443 | Proxy público + SSL |
| Supabase | Externo | — | Base de datos PostgreSQL |

---

## 2. Requisitos del VPS

| Recurso | Mínimo | Recomendado |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disco | 40 GB SSD | 80 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Swap | 2 GB | 4 GB |

> Puppeteer (Chromium) + FFmpeg + Node.js consumen RAM de forma puntual durante el render. Con menos de 4 GB el worker puede ser matado por el OOM killer.

---

## 3. Preparación inicial del servidor

### 3.1 Conectarse al VPS

```bash
ssh root@<IP_CONTABO>
```

### 3.2 Actualizar el sistema

```bash
apt update && apt upgrade -y
apt install -y curl wget git unzip htop ufw fail2ban
```

### 3.3 Crear usuario de deploy (no root)

```bash
adduser deploy
usermod -aG sudo deploy
# Copiar tu clave SSH al nuevo usuario
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

### 3.4 Configurar Swap (si el VPS tiene < 8 GB RAM)

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
# Verificar
free -h
```

### 3.5 Firewall básico

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

---

## 4. Instalar dependencias del sistema

### 4.1 Docker

```bash
# Instalar Docker oficial (no el de apt por defecto)
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
# Verificar
docker --version
docker compose version
```

### 4.2 Nginx

```bash
apt install -y nginx
systemctl enable nginx
systemctl start nginx
```

### 4.3 Certbot

```bash
apt install -y certbot python3-certbot-nginx
```

### 4.4 Node.js 20 (solo para correr migraciones fuera de Docker)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version   # debe ser 20.x
```

---

## 5. Clonar el repositorio

```bash
# Cambiar a usuario deploy
su - deploy

# Crear directorios de trabajo
sudo mkdir -p /var/www/video-engine
sudo chown deploy:deploy /var/www/video-engine

# Clonar
cd /var/www/video-engine
git clone https://github.com/TU_ORG/video-engine-ia.git .

# O si usas el repo separado de backend:
# git clone https://github.com/TU_ORG/video-gen-ai-backend.git backend
```

### 5.1 Crear directorios de almacenamiento

```bash
sudo mkdir -p /var/www/video-engine/storage/temp-videos
sudo mkdir -p /var/log/videogen
sudo chown -R deploy:deploy /var/www/video-engine/storage
sudo chown -R deploy:deploy /var/log/videogen
```

---

## 6. Variables de entorno

### 6.1 Crear `.env.production` en el backend

```bash
cp /var/www/video-engine/backend/_env.example \
   /var/www/video-engine/backend/.env.production

nano /var/www/video-engine/backend/.env.production
```

### 6.2 Valores críticos a configurar

> ⚠️ **IMPORTANTE:** El carácter `&` en contraseñas de Redis DEBE codificarse como `%26` en la URL.

```bash
# ❌ MAL — el & parte la URL
REDIS_URL=redis://:Redis2026&@109.123.243.222:6379

# ✅ BIEN — & codificado como %26
REDIS_URL=redis://:Redis2026%26@109.123.243.222:6379
```

Ver la referencia completa de variables en la [Sección 23](#23-variables-de-entorno-completas--referencia).

### 6.3 Generar secretos seguros

```bash
# Generar VIDEOGEN_SHARED_SECRET (Cursia → Videogen)
openssl rand -hex 32

# Generar VIDEOGEN_WEBHOOK_SECRET (Videogen → Cursia callbacks)
openssl rand -hex 32

# Generar TEMP_DOWNLOAD_SECRET (URLs de descarga firmadas)
openssl rand -hex 32
```

---

## 7. Docker Compose — arquitectura

El archivo `docker-compose.prod.yml` en la raíz del proyecto orquesta tres servicios:

- **api** — NestJS corriendo `node dist/main`, expuesto en `127.0.0.1:3500`
- **worker** — NestJS corriendo `node dist/worker`, procesa la cola BullMQ
- **redis** — Redis 7 Alpine, cola interna

El volumen `video_storage` hace bind-mount en `/var/www/video-engine/storage` del host para persistir los MP4 temporales fuera del ciclo de vida de los contenedores.

Redis **interno** al stack Docker: la URL dentro de Docker es `redis://redis:6379`. Si tu Redis es externo (IP pública), usa la URL externa en las variables de entorno.

---

## 8. Primera construcción y arranque

```bash
cd /var/www/video-engine

# Construir imágenes (la primera vez tarda ~5-10 min)
docker compose -f docker-compose.prod.yml build

# Arrancar en background
docker compose -f docker-compose.prod.yml up -d

# Ver logs en tiempo real
docker compose -f docker-compose.prod.yml logs -f

# Ver estado
docker compose -f docker-compose.prod.yml ps
```

### 8.1 Verificar que el API responde internamente

```bash
# Debe responder 200 con {"status":"ok"} o similar
curl http://127.0.0.1:3500/health
```

Si falla, revisar logs:

```bash
docker compose -f docker-compose.prod.yml logs api --tail=100
docker compose -f docker-compose.prod.yml logs worker --tail=50
```

---

## 9. Nginx — reverse proxy

### 9.1 Copiar la configuración

```bash
sudo cp /var/www/video-engine/nginx/videosb.nomaddi.com.conf \
        /etc/nginx/sites-available/videosb.nomaddi.com

sudo ln -s /etc/nginx/sites-available/videosb.nomaddi.com \
           /etc/nginx/sites-enabled/videosb.nomaddi.com
```

### 9.2 Verificar y recargar Nginx

```bash
sudo nginx -t        # debe decir "syntax is ok"
sudo systemctl reload nginx
```

### 9.3 Verificar que Nginx llega al backend

```bash
# Debe responder (aunque sin SSL aún, HTTP redirige a HTTPS)
curl -L http://videosb.nomaddi.com/health
```

---

## 10. SSL con Certbot

> Asegúrate de que el DNS ya apunta al VPS antes de este paso (ver Sección 11).

### 10.1 Obtener certificado

```bash
sudo certbot --nginx -d videosb.nomaddi.com \
  --email tu@email.com \
  --agree-tos \
  --non-interactive
```

Certbot modifica automáticamente `/etc/nginx/sites-available/videosb.nomaddi.com` para rellenar los bloques SSL.

### 10.2 Verificar renovación automática

```bash
sudo certbot renew --dry-run
```

### 10.3 Verificar HTTPS

```bash
curl https://videosb.nomaddi.com/health
# Debe responder {"status":"ok",...}
```

---

## 11. DNS

Configurar en tu proveedor DNS (Cloudflare recomendado):

| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| A | `videosb` | `<IP_CONTABO>` | 1 min (proxy OFF) |

> **Cloudflare Proxy (naranja):** Desactivarlo inicialmente para que Certbot pueda hacer el challenge HTTP. Una vez con SSL, puedes activarlo si quieres CDN/DDoS protection — pero con proxy activado Certbot usa modo DNS-01, no HTTP-01.

### Verificar propagación DNS

```bash
dig videosb.nomaddi.com A +short
# Debe mostrar la IP de Contabo
```

---

## 12. Migraciones de base de datos

Las migraciones crean las tablas `cursia_batches`, `cursia_items` y `temp_files` en Supabase.

### 12.1 Opción A — Desde el contenedor (recomendado)

```bash
docker compose -f docker-compose.prod.yml run --rm api \
  node -e "require('./dist/main').runMigrations()"
```

O si tienes un script npm configurado:

```bash
docker compose -f docker-compose.prod.yml run --rm api \
  npm run migration:run
```

### 12.2 Opción B — Desde el host con Node.js

```bash
cd /var/www/video-engine/backend
npm ci --omit=optional
NODE_ENV=production npm run migration:run
```

### 12.3 Verificar que las tablas existen

En Supabase > Table Editor, debes ver:
- `cursia_batches`
- `cursia_items`
- `temp_files`

---

## 13. CORS

La variable `CORS_ORIGIN` controla qué frontends pueden llamar a la API.

```env
# Separados por coma, sin espacios
CORS_ORIGIN=https://video-gen-ai-v1.pages.dev,https://video-gen-ai.pages.dev
```

Si agregas un dominio nuevo de frontend, actualiza esta variable y reinicia el contenedor:

```bash
docker compose -f docker-compose.prod.yml restart api
```

---

## 14. Health check y smoke test

### 14.1 Health básico

```bash
curl https://videosb.nomaddi.com/health
```

Respuesta esperada:
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "uptime_seconds": 42
}
```

### 14.2 Test de autenticación

```bash
# Sin token — debe devolver 401
curl https://videosb.nomaddi.com/api/videos

# Con API Key — debe devolver 200 o lista vacía
curl https://videosb.nomaddi.com/api/videos \
  -H "x-api-key: videoengine2024"
```

### 14.3 Test del endpoint Cursia (HMAC)

```bash
SECRET="tu_shared_secret"
TIMESTAMP=$(date +%s)
BODY='{"request_id":"smoke_test_001","course_id":"1","callback_url":"https://webhook.site/tu-uuid","videos":[{"chapter_number":1,"title":"Test","script":"Texto de prueba."}]}'

SIG=$(echo -n "${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -X POST https://videosb.nomaddi.com/api/v1/video-batches \
  -H "Content-Type: application/json" \
  -H "X-Cursia-Request-ID: smoke_test_001" \
  -H "X-Cursia-Timestamp: $TIMESTAMP" \
  -H "X-Cursia-Signature: $SIG" \
  -d "$BODY"
```

Respuesta esperada: `202 Accepted` con `batch_id`.

### 14.4 Test mode (sin consumo de APIs)

Activa `VIDEOGEN_TEST_MODE=true`, envía el batch anterior y verifica que recibes un callback en `webhook.site` con `event: video.generated`.

---

## 15. Checklist post-despliegue

```
[ ] DNS apunta al VPS (verificado con dig)
[ ] HTTPS funcionando (certbot exitoso)
[ ] /health responde 200
[ ] Database: connected en /health
[ ] Redis: connected en /health
[ ] Tablas cursia_batches, cursia_items, temp_files existen en Supabase
[ ] CORS configurado con los dominios del frontend
[ ] Smoke test de autenticación con API Key pasa
[ ] Smoke test de HMAC Cursia pasa (202 Accepted)
[ ] Test mode: callback llega a webhook.site
[ ] Logs de api y worker sin errores críticos
[ ] /var/www/video-engine/storage/ existe y es writable
[ ] docker compose ps: todos los servicios Up
[ ] Certbot renew --dry-run: OK
[ ] ufw: solo 22, 80, 443 abiertos
```

---

## 16. Monitoreo

### 16.1 Ver logs en tiempo real

```bash
# Todos los servicios
docker compose -f docker-compose.prod.yml logs -f

# Solo API
docker compose -f docker-compose.prod.yml logs -f api

# Solo worker (procesos de video)
docker compose -f docker-compose.prod.yml logs -f worker
```

### 16.2 Estado de los contenedores

```bash
docker compose -f docker-compose.prod.yml ps
docker stats   # CPU y RAM en tiempo real
```

### 16.3 Uso de disco

```bash
# Espacio total del VPS
df -h

# Tamaño del almacenamiento de videos
du -sh /var/www/video-engine/storage/

# Tamaño de imágenes Docker
docker system df
```

### 16.4 Monitoreo automático con UptimeRobot (gratuito)

1. Crear cuenta en [uptimerobot.com](https://uptimerobot.com)
2. Agregar monitor HTTP(s): `https://videosb.nomaddi.com/health`
3. Intervalo: 5 minutos
4. Alerta: email / Telegram

---

## 17. Seguridad

### 17.1 Variables de entorno

- Nunca commitear `.env.production` al repositorio
- Agregar `.env.production` al `.gitignore`
- Rotar `VIDEOGEN_SHARED_SECRET` y `VIDEOGEN_WEBHOOK_SECRET` si se filtran

### 17.2 API Key

La variable `API_SECRET` es la API Key del frontend. En producción usar un valor aleatorio:

```bash
openssl rand -hex 24
```

### 17.3 Fail2ban

```bash
# Ya instalado en paso 3.2. Configurar SSH protection:
cat /etc/fail2ban/jail.local || cat > /etc/fail2ban/jail.local <<EOF
[sshd]
enabled = true
maxretry = 5
bantime = 3600
EOF

systemctl restart fail2ban
fail2ban-client status sshd
```

### 17.4 Actualizaciones de seguridad automáticas

```bash
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

### 17.5 Redis — si usas Redis externo

- Redis debe tener contraseña (ya configurada: `Redis2026&`)
- Idealmente Redis solo accesible desde IPs del VPS, no expuesto públicamente
- Puerto 6379 debe estar cerrado en el firewall público

```bash
ufw deny 6379    # Redis nunca debe ser público
```

---

## 18. Backups

### 18.1 Base de datos

Supabase hace backups automáticos (Plan Free: 7 días). Para backups adicionales:

```bash
# Backup manual de Supabase PostgreSQL
pg_dump "postgresql://postgres:videogen20266@db.vokytkpwkboevfrllwty.supabase.co:5432/postgres" \
  > /var/backups/videogen-db-$(date +%Y%m%d).sql
```

### 18.2 Variables de entorno

```bash
# Guardar copia cifrada de las env vars
cp /var/www/video-engine/backend/.env.production \
   /var/backups/env-production-$(date +%Y%m%d).bak
```

### 18.3 Storage de videos

Los MP4 en `/var/www/video-engine/storage/` son temporales (TTL 3h). No requieren backup — se regeneran desde los jobs.

### 18.4 Backup automatizado con cron

```bash
crontab -e
# Agregar:
0 3 * * * pg_dump "postgresql://postgres:videogen20266@db.vokytkpwkboevfrllwty.supabase.co:5432/postgres" | gzip > /var/backups/videogen-db-$(date +\%Y\%m\%d).sql.gz 2>/dev/null
0 4 * * * find /var/backups/ -name "*.sql.gz" -mtime +30 -delete
```

---

## 19. Actualizaciones de código

### 19.1 Deploy manual

```bash
cd /var/www/video-engine

# 1. Obtener cambios
git pull origin main

# 2. Reconstruir imágenes
docker compose -f docker-compose.prod.yml build

# 3. Redeployar con zero-downtime (api primero, luego worker)
docker compose -f docker-compose.prod.yml up -d --no-deps api
docker compose -f docker-compose.prod.yml up -d --no-deps worker

# 4. Verificar
docker compose -f docker-compose.prod.yml ps
curl https://videosb.nomaddi.com/health
```

### 19.2 Si hay migraciones nuevas

```bash
# Correr migraciones ANTES de reiniciar los contenedores
docker compose -f docker-compose.prod.yml run --rm api npm run migration:run

# Luego reiniciar
docker compose -f docker-compose.prod.yml up -d
```

### 19.3 Rollback

```bash
# Volver al commit anterior
git checkout HEAD~1

# Reconstruir y desplegar
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

---

## 20. Gestión del almacenamiento de videos

### 20.1 Limpieza automática

El servicio `TempStorageCleanupService` corre un cron cada hora que:
1. Consulta `temp_files` donde `expires_at < NOW()`
2. Elimina los archivos MP4 del disco
3. Elimina los registros de la DB

### 20.2 Limpieza manual de emergencia

```bash
# Ver cuánto ocupa el storage
du -sh /var/www/video-engine/storage/temp-videos/

# Eliminar archivos de más de 4 horas (por si el cron falló)
find /var/www/video-engine/storage/temp-videos/ -name "*.mp4" -mmin +240 -delete

# Ver cuántos archivos quedan
ls -la /var/www/video-engine/storage/temp-videos/ | wc -l
```

### 20.3 Alertas de disco

```bash
# Script de alerta simple — agregar al crontab
cat > /usr/local/bin/check-disk.sh <<'EOF'
#!/bin/bash
USAGE=$(df /var/www/video-engine/storage | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$USAGE" -gt 80 ]; then
  echo "ALERTA: Disco al ${USAGE}% en /var/www/video-engine/storage" | \
    mail -s "VideogenIA: Disco lleno" tu@email.com
fi
EOF
chmod +x /usr/local/bin/check-disk.sh
# Agregar al crontab: */30 * * * * /usr/local/bin/check-disk.sh
```

---

## 21. Troubleshooting

### 21.1 Backend no responde (503)

```bash
# 1. Verificar que los contenedores están corriendo
docker compose -f docker-compose.prod.yml ps

# 2. Ver logs del API
docker compose -f docker-compose.prod.yml logs api --tail=50

# 3. Verificar que Nginx llega al backend
curl http://127.0.0.1:3500/health

# 4. Reiniciar el servicio
docker compose -f docker-compose.prod.yml restart api
```

### 21.2 Worker no procesa jobs

```bash
# Ver logs del worker
docker compose -f docker-compose.prod.yml logs worker --tail=100

# Verificar Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
# Respuesta esperada: PONG

# Reiniciar worker
docker compose -f docker-compose.prod.yml restart worker
```

### 21.3 Error de conexión a Redis

```bash
# Verificar la URL de Redis en .env.production
# ❌ MAL: redis://:Redis2026&@...
# ✅ BIEN: redis://:Redis2026%26@...

# Si Redis es externo, verificar conectividad desde el VPS
redis-cli -h 109.123.243.222 -p 6379 -a 'Redis2026&' ping
```

### 21.4 Error de conexión a Supabase

```bash
# Probar conexión desde el VPS
psql "postgresql://postgres:videogen20266@db.vokytkpwkboevfrllwty.supabase.co:5432/postgres" \
  -c "SELECT 1"
```

Si falla, verificar que el VPS no está en la blocklist de Supabase (raro, pero posible con IPs de Contabo).

### 21.5 Contenedor se reinicia en loop (CrashLoopBackOff)

```bash
# Ver los últimos logs antes del crash
docker compose -f docker-compose.prod.yml logs api --tail=200

# Los logs de boot tienen este patrón:
# [BOOT] Starting Video Engine IA...
# [BOOT] NestJS app created OK      ← si no aparece, falla en la inicialización
# [BOOT] Server listening successfully on port 3500  ← si no aparece, falla post-init

# Causas comunes:
# - REDIS_URL mal formada (& sin codificar)
# - DATABASE_URL incorrecta
# - Puerto 3500 ya en uso
# - Variables de entorno faltantes
```

### 21.6 SSL expirado / Certbot falla

```bash
sudo certbot renew
sudo systemctl reload nginx

# Si falla el renew por DNS:
sudo certbot certonly --nginx -d videosb.nomaddi.com
```

### 21.7 Disco lleno

```bash
# Ver qué ocupa más
du -sh /var/www/video-engine/storage/temp-videos/
docker system df

# Limpiar imágenes Docker no usadas
docker system prune -f

# Limpiar temp videos expirados manualmente
find /var/www/video-engine/storage/temp-videos/ -name "*.mp4" -mmin +180 -delete
```

### 21.8 CORS error en el frontend

```bash
# Verificar que CORS_ORIGIN incluye el dominio del frontend
grep CORS_ORIGIN /var/www/video-engine/backend/.env.production

# Actualizar y reiniciar
# CORS_ORIGIN=https://video-gen-ai-v1.pages.dev,https://tudominio.com
docker compose -f docker-compose.prod.yml restart api
```

---

## 22. Alternativa: PM2 sin Docker

Si prefieres no usar Docker, puedes usar PM2 directamente en el host.

### 22.1 Instalar PM2

```bash
npm install -g pm2
```

### 22.2 Construir el backend

```bash
cd /var/www/video-engine/backend
npm ci
npm run build
```

### 22.3 Instalar dependencias del sistema para Puppeteer + FFmpeg

```bash
# Chromium
apt install -y chromium-browser

# FFmpeg
apt install -y ffmpeg

# Verificar
chromium-browser --version
ffmpeg -version
```

### 22.4 Arrancar con PM2

```bash
cd /var/www/video-engine/backend
pm2 start ../ecosystem.config.js --env production
pm2 save
pm2 startup   # genera el comando para auto-arranque en boot
```

### 22.5 Comandos PM2 útiles

```bash
pm2 status              # estado de procesos
pm2 logs                # logs de todos
pm2 logs videogen-api   # logs del API
pm2 restart all         # reiniciar todo
pm2 monit               # monitor interactivo de CPU/RAM
```

### 22.6 Diferencias vs Docker

| | Docker Compose | PM2 |
|---|---|---|
| Redis | Contenedor propio | Externo (IP pública) |
| Chromium/FFmpeg | Dentro del Dockerfile | Instalar en host |
| Aislamiento | Total | Ninguno |
| Actualizaciones | Reconstruir imagen | `npm run build` + restart |
| Recomendado | ✅ Sí | Alternativa simple |

---

## 23. Variables de entorno completas — referencia

Archivo: `/var/www/video-engine/backend/.env.production`

```env
# ── Aplicación ──────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=3500
LOG_LEVEL=log

# ── Autenticación interna ────────────────────────────────────────────────────
API_SECRET=<clave aleatoria del frontend>
SKIP_AUTH=false

# ── CORS ─────────────────────────────────────────────────────────────────────
CORS_ORIGIN=https://video-gen-ai-v1.pages.dev,https://video-gen-ai.pages.dev

# ── Supabase ─────────────────────────────────────────────────────────────────
SUPABASE_URL=https://vokytkpwkboevfrllwty.supabase.co
SUPABASE_ANON_KEY=sb_publishable_X2yfWLBHcmxp9tRIusAXIg_f-geFScq
SUPABASE_SERVICE_ROLE_KEY=sb_secret_4RPClfsWLykYBrLtEcF1bg_Zth8Wd49
SUPABASE_JWT_SECRET=VOdg+U2bWYcB9UH475Ohj8YFMFDc6rnxHVhOqyQK1txWdQtj7/sQkuNqd91J48tzjuh7/Iin4osWYsm3h7KPXQ==

# ── Base de datos ─────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:videogen20266@db.vokytkpwkboevfrllwty.supabase.co:5432/postgres

# ── Redis ─────────────────────────────────────────────────────────────────────
# ⚠️  CRÍTICO: Si la contraseña tiene &, codificarla como %26
# Docker interno:  REDIS_URL=redis://redis:6379
# Redis externo:   REDIS_URL=redis://:Redis2026%26@109.123.243.222:6379
REDIS_URL=redis://redis:6379

# ── OpenAI ───────────────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o
OPENAI_IMAGE_MODEL=dall-e-3
OPENAI_IMAGE_SIZE=1792x1024
OPENAI_IMAGE_QUALITY=standard

# ── ElevenLabs ───────────────────────────────────────────────────────────────
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_DEFAULT_VOICE_ID=dQ0C8BEdKF2odmELvNee
ELEVENLABS_MODEL_ID=eleven_multilingual_v2

# ── Almacenamiento temporal de videos ────────────────────────────────────────
STORAGE_DRIVER=local
STORAGE_BASE_PATH=/app/storage

TEMP_STORAGE_PROVIDER=local
TEMP_VIDEO_DIR=./storage/temp-videos
TEMP_FILE_TTL_SECONDS=10800
TEMP_DOWNLOAD_SECRET=<openssl rand -hex 32>
PUBLIC_API_URL=https://videosb.nomaddi.com

# ── Puppeteer ────────────────────────────────────────────────────────────────
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# ── Defaults de generación ───────────────────────────────────────────────────
DEFAULT_FPS=30
DEFAULT_RESOLUTION_WIDTH=1920
DEFAULT_RESOLUTION_HEIGHT=1080
DEFAULT_TARGET_DURATION_MINUTES=7
DEFAULT_VISUAL_STYLE=notebooklm
DEFAULT_DAILY_VIDEO_LIMIT=10
QUEUE_CONCURRENCY=1

# ── Integración Cursia ────────────────────────────────────────────────────────
VIDEOGEN_SHARED_SECRET=<openssl rand -hex 32>   # Cursia firma requests con esto
VIDEOGEN_WEBHOOK_SECRET=<openssl rand -hex 32>  # Videogen firma callbacks con esto
VIDEOGEN_TEST_MODE=false                         # true = sin generación real, útil para testing
```

---

## 24. Contacto y recursos

| Recurso | URL |
|---|---|
| Repositorio | `https://github.com/TU_ORG/video-engine-ia` |
| Backend prod | `https://videosb.nomaddi.com` |
| Frontend prod | `https://video-gen-ai-v1.pages.dev` |
| Supabase | `https://supabase.com/dashboard/project/vokytkpwkboevfrllwty` |
| API Contract Cursia | `docs/CURSIA_API_CONTRACT.md` |
| Contabo panel | `https://my.contabo.com` |
| Cloudflare DNS | `https://dash.cloudflare.com` |

---

### Comandos rápidos de referencia

```bash
# Estado general
docker compose -f docker-compose.prod.yml ps

# Logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f worker

# Reiniciar todo
docker compose -f docker-compose.prod.yml restart

# Reconstruir y desplegar (tras git pull)
docker compose -f docker-compose.prod.yml build && \
docker compose -f docker-compose.prod.yml up -d

# Health check
curl https://videosb.nomaddi.com/health

# Redis ping interno
docker compose -f docker-compose.prod.yml exec redis redis-cli ping

# Espacio en disco
df -h && du -sh /var/www/video-engine/storage/
```

---

*Guía generada para Video Engine IA / Eduvia — Mayo 2026*
