import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUiDemoToScenes1747700000000 implements MigrationInterface {
  name = 'AddUiDemoToScenes1747700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE video_scenes ADD COLUMN IF NOT EXISTS ui_demo JSONB NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE video_scenes DROP COLUMN IF EXISTS ui_demo`);
  }
}
