import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTempFiles1747400000000 implements MigrationInterface {
  name = 'CreateTempFiles1747400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "temp_files" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "file_path" character varying(500) NOT NULL,
        "job_id" uuid,
        "size_bytes" bigint,
        "duration_seconds" double precision,
        "checksum_sha256" character varying(64),
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "downloaded_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_temp_files" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_temp_files_expires_at" ON "temp_files" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_temp_files_expires_at"`);
    await queryRunner.query(`DROP TABLE "temp_files"`);
  }
}
