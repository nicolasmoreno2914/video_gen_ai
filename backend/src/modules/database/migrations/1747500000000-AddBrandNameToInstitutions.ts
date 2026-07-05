import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBrandNameToInstitutions1747500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE institutions
      ADD COLUMN IF NOT EXISTS brand_institution_name VARCHAR(255) NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE institutions
      DROP COLUMN IF EXISTS brand_institution_name;
    `);
  }
}
