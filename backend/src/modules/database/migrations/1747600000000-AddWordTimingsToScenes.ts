import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWordTimingsToScenes1747600000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE video_scenes
      ADD COLUMN IF NOT EXISTS word_timings JSONB NULL,
      ADD COLUMN IF NOT EXISTS reveal_cues JSONB NULL,
      ADD COLUMN IF NOT EXISTS icons JSONB NULL,
      ADD COLUMN IF NOT EXISTS image_precision VARCHAR(10) NULL,
      ADD COLUMN IF NOT EXISTS image_style VARCHAR(10) NULL,
      ADD COLUMN IF NOT EXISTS image_check TEXT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE video_scenes
      DROP COLUMN IF EXISTS word_timings,
      DROP COLUMN IF EXISTS reveal_cues,
      DROP COLUMN IF EXISTS icons,
      DROP COLUMN IF EXISTS image_precision,
      DROP COLUMN IF EXISTS image_style,
      DROP COLUMN IF EXISTS image_check;
    `);
  }
}
