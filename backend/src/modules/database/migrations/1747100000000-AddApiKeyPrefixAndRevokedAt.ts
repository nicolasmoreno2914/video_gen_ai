import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApiKeyPrefixAndRevokedAt1747100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(30)`,
    );
    await queryRunner.query(
      `ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ`,
    );
    // Backfill prefix for existing keys (use key_hash prefix as placeholder)
    await queryRunner.query(
      `UPDATE api_keys SET key_prefix = 'vei_' || LEFT(key_hash, 12) WHERE key_prefix IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE api_keys DROP COLUMN IF EXISTS revoked_at`);
    await queryRunner.query(`ALTER TABLE api_keys DROP COLUMN IF EXISTS key_prefix`);
  }
}
