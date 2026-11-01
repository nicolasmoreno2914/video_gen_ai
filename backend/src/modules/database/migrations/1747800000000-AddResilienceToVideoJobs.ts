import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResilienceToVideoJobs1747800000000 implements MigrationInterface {
  name = 'AddResilienceToVideoJobs1747800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS auto_retry_count INT NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP NULL`);
    await queryRunner.query(`ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP NULL`);
    await queryRunner.query(`ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS failure_kind VARCHAR(20) NULL`);
    await queryRunner.query(`ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS last_error TEXT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['last_error', 'failure_kind', 'heartbeat_at', 'next_retry_at', 'auto_retry_count']) {
      await queryRunner.query(`ALTER TABLE video_jobs DROP COLUMN IF EXISTS ${col}`);
    }
  }
}
