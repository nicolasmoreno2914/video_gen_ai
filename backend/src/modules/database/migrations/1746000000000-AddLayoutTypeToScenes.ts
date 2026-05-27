import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLayoutTypeToScenes1746000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "video_scenes" ADD COLUMN IF NOT EXISTS "layout_type" VARCHAR(50) NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "video_scenes" DROP COLUMN IF EXISTS "layout_type"`,
    );
  }
}
