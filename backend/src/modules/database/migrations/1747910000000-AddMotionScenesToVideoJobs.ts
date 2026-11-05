import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMotionScenesToVideoJobs1747910000000 implements MigrationInterface {
  name = 'AddMotionScenesToVideoJobs1747910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS motion_scenes BOOLEAN NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE video_jobs DROP COLUMN IF EXISTS motion_scenes`);
  }
}
