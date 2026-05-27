import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCursiaTables1747300000000 implements MigrationInterface {
  name = 'CreateCursiaTables1747300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."cursia_batches_status_enum" AS ENUM ('queued', 'processing', 'completed', 'partial', 'failed')
    `);

    await queryRunner.query(`
      CREATE TABLE "cursia_batches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "request_id" character varying(255) NOT NULL,
        "cursia_course_id" character varying(255),
        "callback_url" character varying(500) NOT NULL,
        "status" "public"."cursia_batches_status_enum" NOT NULL DEFAULT 'queued',
        "total_items" integer NOT NULL DEFAULT 0,
        "completed_items" integer NOT NULL DEFAULT 0,
        "failed_items" integer NOT NULL DEFAULT 0,
        "options" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_cursia_batches_request_id" UNIQUE ("request_id"),
        CONSTRAINT "PK_cursia_batches" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."cursia_items_status_enum" AS ENUM ('queued', 'generating', 'generated', 'failed', 'expired')
    `);

    await queryRunner.query(`
      CREATE TABLE "cursia_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "batch_id" uuid NOT NULL,
        "chapter_number" integer NOT NULL DEFAULT 1,
        "title" character varying(500) NOT NULL,
        "script_hash" character varying(64),
        "status" "public"."cursia_items_status_enum" NOT NULL DEFAULT 'queued',
        "file_url" character varying(1000),
        "file_expires_at" TIMESTAMP WITH TIME ZONE,
        "file_size_bytes" bigint,
        "duration_seconds" double precision,
        "checksum_sha256" character varying(64),
        "error" text,
        "retry_count" integer NOT NULL DEFAULT 0,
        "video_job_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cursia_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cursia_items_batch" FOREIGN KEY ("batch_id") REFERENCES "cursia_batches"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_cursia_items_batch_id" ON "cursia_items" ("batch_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_cursia_items_video_job_id" ON "cursia_items" ("video_job_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_cursia_items_video_job_id"`);
    await queryRunner.query(`DROP INDEX "IDX_cursia_items_batch_id"`);
    await queryRunner.query(`DROP TABLE "cursia_items"`);
    await queryRunner.query(`DROP TYPE "public"."cursia_items_status_enum"`);
    await queryRunner.query(`DROP TABLE "cursia_batches"`);
    await queryRunner.query(`DROP TYPE "public"."cursia_batches_status_enum"`);
  }
}
