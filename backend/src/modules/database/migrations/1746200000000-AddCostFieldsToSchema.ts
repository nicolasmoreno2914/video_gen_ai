import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCostFieldsToSchema1746200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS model_name VARCHAR(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS unit_type VARCHAR(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS metadata JSONB`,
    );
    await queryRunner.query(
      `ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS estimated_total_cost DECIMAL(10,6) DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS cost_breakdown JSONB`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE video_jobs DROP COLUMN IF EXISTS cost_breakdown`,
    );
    await queryRunner.query(
      `ALTER TABLE video_jobs DROP COLUMN IF EXISTS estimated_total_cost`,
    );
    await queryRunner.query(
      `ALTER TABLE api_usage_logs DROP COLUMN IF EXISTS metadata`,
    );
    await queryRunner.query(
      `ALTER TABLE api_usage_logs DROP COLUMN IF EXISTS unit_type`,
    );
    await queryRunner.query(
      `ALTER TABLE api_usage_logs DROP COLUMN IF EXISTS model_name`,
    );
  }
}
