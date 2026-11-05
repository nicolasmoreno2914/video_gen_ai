import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMotionSpecToScenes1747900000000 implements MigrationInterface {
  name = 'AddMotionSpecToScenes1747900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE video_scenes ADD COLUMN IF NOT EXISTS motion_spec JSONB NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE video_scenes DROP COLUMN IF EXISTS motion_spec`);
  }
}
