import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalFieldsToVideoJobs1747200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS source_system VARCHAR(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS client_reference_id VARCHAR(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS batch_id UUID`,
    );
    await queryRunner.query(
      `ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS batch_reference_id VARCHAR(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS external_metadata JSONB`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_video_jobs_institution_batch
         ON video_jobs(institution_id, batch_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_video_jobs_institution_client_ref
         ON video_jobs(institution_id, client_reference_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_video_jobs_institution_client_ref`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_video_jobs_institution_batch`);
    await queryRunner.query(`ALTER TABLE video_jobs DROP COLUMN IF EXISTS external_metadata`);
    await queryRunner.query(`ALTER TABLE video_jobs DROP COLUMN IF EXISTS batch_reference_id`);
    await queryRunner.query(`ALTER TABLE video_jobs DROP COLUMN IF EXISTS batch_id`);
    await queryRunner.query(`ALTER TABLE video_jobs DROP COLUMN IF EXISTS client_reference_id`);
    await queryRunner.query(`ALTER TABLE video_jobs DROP COLUMN IF EXISTS source_system`);
  }
}
