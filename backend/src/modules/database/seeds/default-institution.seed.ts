import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Institution } from '../entities/institution.entity';
import { VideoJob } from '../entities/video-job.entity';
import { VideoScene } from '../entities/video-scene.entity';
import { ApiUsageLog } from '../entities/api-usage-log.entity';

dotenv.config();

async function seed(): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME ?? 'video_engine',
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    entities: [Institution, VideoJob, VideoScene, ApiUsageLog],
    synchronize: false,
  });

  await dataSource.initialize();

  const institutionRepo = dataSource.getRepository(Institution);

  const existing = await institutionRepo.findOne({
    where: { id: '00000000-0000-0000-0000-000000000001' },
  });

  if (existing) {
    console.log('Seed: institución demo ya existe, omitiendo.');
    await dataSource.destroy();
    return;
  }

  const demo = institutionRepo.create({
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Institución Demo',
    slug: 'demo',
    daily_video_limit: 50,
    brand_primary_color: '#003366',
    brand_secondary_color: '#00AEEF',
    visual_style: 'notebooklm',
  });

  await institutionRepo.save(demo);
  console.log('Seed: institución demo creada con ID 00000000-0000-0000-0000-000000000001');

  await dataSource.destroy();
}

seed().catch((err: Error) => {
  console.error('Error en seed:', err.message);
  process.exit(1);
});
