#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy manual de Videogen en VPS Contabo
# =============================================================================
# Uso:
#   bash /var/www/videogen/scripts/deploy.sh
#
# Requisitos:
#   - Ejecutar como usuario videogen (no root)
#   - PM2 instalado globalmente: npm install -g pm2
#   - .env creado en /var/www/videogen/backend/.env
#   - Repo clonado en /var/www/videogen
# =============================================================================

set -euo pipefail

# ── Configuración ──────────────────────────────────────────────────────────────
PROJECT_DIR="/var/www/videogen"
BACKEND_DIR="${PROJECT_DIR}/backend"
STORAGE_DIR="${PROJECT_DIR}/storage"
TEMP_VIDEO_DIR="${STORAGE_DIR}/temp-videos"
LOG_DIR="/var/log/videogen"
HEALTH_URL="http://127.0.0.1:3001/health"
BRANCH="${DEPLOY_BRANCH:-main}"

# ── Colores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()    { echo -e "${YELLOW}[deploy]${NC} $*"; }
error()   { echo -e "${RED}[deploy] ERROR:${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

echo ""
echo "=============================================="
echo "  Videogen — Deploy a producción Contabo"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="
echo ""

# ── 1. Verificar que el .env existe ───────────────────────────────────────────
info "Verificando .env..."
[[ -f "${BACKEND_DIR}/.env" ]] || die ".env no encontrado en ${BACKEND_DIR}/.env — crea el archivo primero."

# ── 2. Crear directorios necesarios ───────────────────────────────────────────
info "Creando directorios de storage..."
mkdir -p "${TEMP_VIDEO_DIR}"
mkdir -p "${LOG_DIR}"
mkdir -p "${STORAGE_DIR}/jobs"
mkdir -p "${STORAGE_DIR}/logs"

# ── 3. Git pull ────────────────────────────────────────────────────────────────
info "Actualizando código desde git (rama: ${BRANCH})..."
cd "${PROJECT_DIR}"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull origin "${BRANCH}"
echo ""
info "Último commit:"
git log --oneline -3
echo ""

# ── 4. npm install ────────────────────────────────────────────────────────────
info "Instalando dependencias..."
cd "${BACKEND_DIR}"
npm ci --omit=optional 2>&1 | tail -5
info "npm install completado."

# ── 5. Build TypeScript ────────────────────────────────────────────────────────
info "Compilando TypeScript..."
npm run build
info "Build completado. dist/ generado."

# ── 6. Migraciones ────────────────────────────────────────────────────────────
info "Ejecutando migraciones de base de datos..."
if npm run migration:run 2>&1; then
  info "Migraciones OK."
else
  warn "Las migraciones fallaron o ya estaban aplicadas. Revisa manualmente si es necesario."
fi

# ── 7. Recargar PM2 ───────────────────────────────────────────────────────────
info "Recargando procesos PM2..."

# Si los procesos no existen todavía, los inicia desde el ecosystem.config.js
if pm2 list | grep -q "videogen-api"; then
  pm2 reload "${PROJECT_DIR}/ecosystem.config.js" --env production
  info "PM2 reload completado."
else
  warn "Procesos PM2 no encontrados. Iniciando por primera vez..."
  pm2 start "${PROJECT_DIR}/ecosystem.config.js" --env production
  pm2 save
  info "PM2 iniciado. Recuerda ejecutar 'pm2 startup' si aún no está configurado."
fi

# ── 8. Health check ───────────────────────────────────────────────────────────
info "Esperando que el servidor arranque..."
sleep 5

MAX_TRIES=12
TRIES=0
while [[ $TRIES -lt $MAX_TRIES ]]; do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}" 2>/dev/null || echo "000")
  if [[ "$HTTP_STATUS" == "200" ]]; then
    info "Health check OK (HTTP ${HTTP_STATUS})"
    break
  fi
  TRIES=$((TRIES + 1))
  warn "Health check intento ${TRIES}/${MAX_TRIES} — HTTP ${HTTP_STATUS}. Esperando 5s..."
  sleep 5
done

if [[ $TRIES -eq $MAX_TRIES ]]; then
  error "Health check falló tras ${MAX_TRIES} intentos."
  echo ""
  error "Últimos logs del API:"
  pm2 logs videogen-api --lines 30 --nostream 2>/dev/null || true
  echo ""
  die "Deploy incompleto. Revisa los logs arriba."
fi

# ── 9. Resumen ────────────────────────────────────────────────────────────────
echo ""
echo "=============================================="
echo -e "  ${GREEN}✅ Deploy completado exitosamente${NC}"
echo "=============================================="
echo ""
info "Status PM2:"
pm2 status
echo ""
info "Para ver logs en tiempo real:"
echo "   pm2 logs videogen-api"
echo "   pm2 logs videogen-worker"
echo ""
info "Para rollback:"
echo "   cd ${PROJECT_DIR} && git checkout HEAD~1"
echo "   cd ${BACKEND_DIR} && npm run build && pm2 reload ecosystem.config.js --env production"
echo ""
