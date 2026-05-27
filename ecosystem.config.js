/**
 * ecosystem.config.js — PM2 para Videogen en VPS Contabo
 *
 * Producción:
 *   cd /var/www/videogen/backend
 *   npm run build
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save
 *   pm2 startup
 *
 * Monitoreo:
 *   pm2 status
 *   pm2 logs videogen-api
 *   pm2 logs videogen-worker
 *   pm2 monit
 *
 * Notas de puertos:
 *   - Producción Contabo: PORT=3001 (Nginx hace proxy público → localhost:3001)
 *   - Local / staging:    PORT=3500 (sin cambios en el flujo local)
 *
 * ⚠️  No pongas secretos aquí. Carga el .env desde el directorio del proyecto.
 *    Los valores de env_production se fusionan con el .env cargado en el arranque.
 */

module.exports = {
  apps: [

    // ── API HTTP ──────────────────────────────────────────────────────────────
    {
      name: 'videogen-api',
      script: 'dist/main.js',
      cwd: '/var/www/videogen/backend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 5000,
      listen_timeout: 10000,  // wait 10s for NestJS to bind port before marking online
      restart_delay: 2000,    // wait 2s between crash restarts — prevents EADDRINUSE spiral
      max_restarts: 10,       // halt crash-loop after 10 attempts within min_uptime window
      env_production: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      error_file: '/var/log/videogen/api-error.log',
      out_file:   '/var/log/videogen/api-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ── Worker BullMQ ─────────────────────────────────────────────────────────
    {
      name: 'videogen-worker',
      script: 'dist/worker.js',
      cwd: '/var/www/videogen/backend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',   // FFmpeg + Chromium consumen RAM puntualmente
      kill_timeout: 30000,        // 30s para que el job en curso termine limpiamente
      env_production: {
        NODE_ENV: 'production',
        QUEUE_CONCURRENCY: '1',   // 1 video a la vez — conserva RAM en VPS
      },
      error_file: '/var/log/videogen/worker-error.log',
      out_file:   '/var/log/videogen/worker-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

  ],
};
