/**
 * generate-cursia-apikey.ts
 *
 * Crea (si no existe) la institución "Cursia" en Videogen y genera
 * una API key externa para el proxy de Cursia Backend.
 *
 * La key se muestra UNA SOLA VEZ — cópiala inmediatamente a:
 *   /var/www/cursia-backend/.env  →  VIDEOGEN_API_KEY=<key>
 *
 * Uso (en el VPS de Videogen, desde /var/www/video-engine-ia/backend):
 *   npx ts-node -r tsconfig-paths/register src/scripts/generate-cursia-apikey.ts
 *
 * El script es idempotente para la institución (no la duplica),
 * pero SIEMPRE genera una nueva API key. Si ya existe una key activa
 * se muestra el prefijo y se pregunta si continuar.
 *
 * Requiere: DATABASE_URL o DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD en .env
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { Institution }    from '../modules/database/entities/institution.entity';
import { ApiKey }         from '../modules/database/entities/api-key.entity';
import { VideoJob }       from '../modules/database/entities/video-job.entity';
import { VideoScene }     from '../modules/database/entities/video-scene.entity';
import { InstitutionUser } from '../modules/database/entities/institution-user.entity';
import { WebhookEndpoint } from '../modules/database/entities/webhook-endpoint.entity';
import { OAuthConnection } from '../modules/database/entities/oauth-connection.entity';
import { ApiUsageLog }    from '../modules/database/entities/api-usage-log.entity';

dotenv.config();

// ── Conexión DB (misma lógica que datasource.ts) ──────────────────────────────
const isProduction = process.env.NODE_ENV !== 'development';

const connectionOptions = process.env.DATABASE_URL
  ? { url: process.env.DATABASE_URL, ssl: isProduction ? { rejectUnauthorized: false } : false }
  : {
      host:     process.env.DB_HOST     ?? 'localhost',
      port:     parseInt(process.env.DB_PORT ?? '5432', 10),
      database: process.env.DB_NAME     ?? 'video_engine',
      username: process.env.DB_USER     ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    };

const ds = new DataSource({
  type: 'postgres',
  ...connectionOptions,
  entities: [Institution, ApiKey, VideoJob, VideoScene, InstitutionUser, WebhookEndpoint, OAuthConnection, ApiUsageLog],
  synchronize: false,
  logging: false,
});

async function run(): Promise<void> {
  await ds.initialize();

  const institutionRepo = ds.getRepository(Institution);
  const apiKeyRepo      = ds.getRepository(ApiKey);

  // ── 1. Encontrar o crear institución Cursia ──────────────────────────────────
  let institution = await institutionRepo.findOne({ where: { slug: 'cursia' } });

  if (institution) {
    console.log(`\n✅ Institución encontrada: "${institution.name}" (id: ${institution.id})`);
  } else {
    institution = institutionRepo.create({
      name:  'Cursia',
      slug:  'cursia',
      daily_video_limit: 100,
    });
    institution = await institutionRepo.save(institution);
    console.log(`\n🆕 Institución "Cursia" creada (id: ${institution.id})`);
  }

  // ── 2. Verificar keys activas existentes ────────────────────────────────────
  const existingKeys = await apiKeyRepo.find({
    where: { institution_id: institution.id, is_active: true },
    order: { created_at: 'DESC' },
  });

  if (existingKeys.length > 0) {
    console.log(`\n⚠️  Ya existen ${existingKeys.length} API key(s) activa(s) para Cursia:`);
    existingKeys.forEach(k => {
      console.log(`   - [${k.id}] "${k.label}"  prefijo: ${k.key_prefix ?? 'n/a'}  creada: ${k.created_at.toISOString()}`);
    });
    console.log('\n   Se generará una nueva key adicional (las anteriores siguen activas).');
    console.log('   Para revocar las antiguas usa el endpoint DELETE /api/api-keys/:id con JWT de Videogen.\n');
  }

  // ── 3. Generar nueva API key ─────────────────────────────────────────────────
  const rawKey = `veia_live_${randomBytes(32).toString('hex')}`;
  const hash   = createHash('sha256').update(rawKey).digest('hex');
  const prefix = rawKey.substring(0, 20) + '...';

  const record = apiKeyRepo.create({
    institution_id: institution.id,
    key_hash:       hash,
    key_prefix:     prefix,
    label:          'cursia-backend-proxy',
    is_active:      true,
    revoked_at:     null,
  });
  const saved = await apiKeyRepo.save(record);

  // ── 4. Output seguro ─────────────────────────────────────────────────────────
  console.log('═'.repeat(60));
  console.log('  API KEY GENERADA — cópiala ahora, no se mostrará de nuevo');
  console.log('═'.repeat(60));
  console.log(`\n  VIDEOGEN_API_KEY=${rawKey}\n`);
  console.log('═'.repeat(60));
  console.log(`\n  id:      ${saved.id}`);
  console.log(`  label:   ${saved.label}`);
  console.log(`  prefijo: ${prefix}`);
  console.log(`  hash:    ${hash.substring(0, 16)}...  (guardado en DB)`);
  console.log('\n  Pasos siguientes:');
  console.log('  1. Copia la línea VIDEOGEN_API_KEY=... al .env de Cursia backend');
  console.log('     /var/www/cursia-backend/.env');
  console.log('  2. pm2 restart cursia-backend');
  console.log('  3. Prueba: curl -s https://api.cursia.nomaddi.com/health');
  console.log('');

  await ds.destroy();
}

run().catch((err: Error) => {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
