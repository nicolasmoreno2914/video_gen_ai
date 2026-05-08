import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRequiresAiImageToScenes1746100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "video_scenes" ADD COLUMN IF NOT EXISTS "requires_ai_image" BOOLEAN NOT NULL DEFAULT true`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "video_scenes" DROP COLUMN IF EXISTS "requires_ai_image"`,
    );
  }
}
