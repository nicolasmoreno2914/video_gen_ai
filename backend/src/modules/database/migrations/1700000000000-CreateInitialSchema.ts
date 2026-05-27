import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInitialSchema1700000000000 implements MigrationInterface {
  name = 'CreateInitialSchema1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "institutions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(255) NOT NULL,
        "slug" character varying(100) NOT NULL,
        "daily_video_limit" integer NOT NULL DEFAULT 10,
        "brand_logo_url" character varying(500),
        "brand_primary_color" character varying(20) NOT NULL DEFAULT '#003366',
        "brand_secondary_color" character varying(20) NOT NULL DEFAULT '#00AEEF',
        "elevenlabs_voice_id" character varying(255),
        "youtube_client_id" character varying(500),
        "youtube_client_secret" character varying(500),
        "youtube_refresh_token" text,
        "youtube_channel_id" character varying(100),
        "visual_style" character varying(50) NOT NULL DEFAULT 'notebooklm',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_institutions_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_institutions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "video_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "institution_id" uuid,
        "course_id" character varying(255),
        "chapter_id" character varying(255),
        "title" character varying(500) NOT NULL,
        "content_txt" text NOT NULL,
        "language" character varying(10) NOT NULL DEFAULT 'es',
        "target_duration_minutes" integer NOT NULL DEFAULT 10,
        "visual_style" character varying(50) NOT NULL DEFAULT 'notebooklm',
        "dry_run" boolean NOT NULL DEFAULT false,
        "brand_logo_url" character varying(500),
        "brand_primary_color" character varying(20) NOT NULL DEFAULT '#003366',
        "brand_secondary_color" character varying(20) NOT NULL DEFAULT '#00AEEF',
        "brand_institution_name" character varying(255),
        "brand_voice_id" character varying(255),
        "youtube_privacy" character varying(20) NOT NULL DEFAULT 'unlisted',
        "youtube_title" character varying(500),
        "youtube_description" text,
        "callback_url" character varying(500),
        "status" character varying(50) NOT NULL DEFAULT 'queued',
        "progress" integer NOT NULL DEFAULT 0,
        "current_step" character varying(100),
        "completed_steps" jsonb NOT NULL DEFAULT '[]',
        "generated_script" jsonb,
        "youtube_url" character varying(500),
        "embed_url" character varying(500),
        "youtube_video_id" character varying(100),
        "local_mp4_available" boolean NOT NULL DEFAULT false,
        "local_mp4_path" character varying(500),
        "downloaded_at" TIMESTAMP,
        "duration_seconds" integer,
        "thumbnail_url" character varying(500),
        "scenes_count" integer,
        "error_message" text,
        "retry_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_video_jobs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_video_jobs_institution_created" ON "video_jobs" ("institution_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_video_jobs_course_chapter" ON "video_jobs" ("course_id", "chapter_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "video_jobs"
        ADD CONSTRAINT "FK_video_jobs_institution"
        FOREIGN KEY ("institution_id")
        REFERENCES "institutions"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "video_scenes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "video_job_id" uuid NOT NULL,
        "scene_order" integer NOT NULL,
        "scene_type" character varying(50),
        "learning_goal" text,
        "title" character varying(500),
        "narration" text,
        "on_screen_text" jsonb,
        "visual_direction" text,
        "image_prompt" text,
        "highlight_words" jsonb,
        "transition" character varying(50) NOT NULL DEFAULT 'fade',
        "image_url" character varying(500),
        "slide_png_url" character varying(500),
        "audio_url" character varying(500),
        "duration_seconds" float,
        "estimated_duration_seconds" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_video_scenes" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "video_scenes"
        ADD CONSTRAINT "FK_video_scenes_job"
        FOREIGN KEY ("video_job_id")
        REFERENCES "video_jobs"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "api_usage_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "video_job_id" uuid NOT NULL,
        "institution_id" uuid,
        "provider" character varying(50) NOT NULL,
        "operation" character varying(100) NOT NULL,
        "input_units" integer,
        "output_units" integer,
        "estimated_cost" decimal(10,6),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_usage_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "api_usage_logs"
        ADD CONSTRAINT "FK_api_usage_logs_job"
        FOREIGN KEY ("video_job_id")
        REFERENCES "video_jobs"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "api_usage_logs"
        ADD CONSTRAINT "FK_api_usage_logs_institution"
        FOREIGN KEY ("institution_id")
        REFERENCES "institutions"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "api_usage_logs" DROP CONSTRAINT "FK_api_usage_logs_institution"`);
    await queryRunner.query(`ALTER TABLE "api_usage_logs" DROP CONSTRAINT "FK_api_usage_logs_job"`);
    await queryRunner.query(`DROP TABLE "api_usage_logs"`);
    await queryRunner.query(`ALTER TABLE "video_scenes" DROP CONSTRAINT "FK_video_scenes_job"`);
    await queryRunner.query(`DROP TABLE "video_scenes"`);
    await queryRunner.query(`DROP INDEX "IDX_video_jobs_course_chapter"`);
    await queryRunner.query(`DROP INDEX "IDX_video_jobs_institution_created"`);
    await queryRunner.query(`ALTER TABLE "video_jobs" DROP CONSTRAINT "FK_video_jobs_institution"`);
    await queryRunner.query(`DROP TABLE "video_jobs"`);
    await queryRunner.query(`DROP TABLE "institutions"`);
  }
}
