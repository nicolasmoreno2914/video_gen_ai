import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWordTimingsToScenes1747600000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE video_scenes
      ADD COLUMN IF NOT EXISTS word_timings JSONB NULL,
      ADD COLUMN IF NOT EXISTS reveal_cues JSONB NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE video_scenes
      DROP COLUMN IF EXISTS word_timings,
      DROP COLUMN IF EXISTS reveal_cues;
    `);
  }
}
