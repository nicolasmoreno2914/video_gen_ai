import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthTables1747000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS institution_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
        supabase_user_id UUID NOT NULL UNIQUE,
        role VARCHAR(50) NOT NULL DEFAULT 'admin',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_institution_users_institution_id
        ON institution_users(institution_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_institution_users_supabase_user_id
        ON institution_users(supabase_user_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
        key_hash VARCHAR(64) NOT NULL UNIQUE,
        label VARCHAR(255) NOT NULL DEFAULT 'default',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_institution_id
        ON api_keys(institution_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash
        ON api_keys(key_hash)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS webhook_endpoints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        secret VARCHAR(255) NOT NULL,
        events TEXT[] NOT NULL DEFAULT '{}',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_institution_id
        ON webhook_endpoints(institution_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oauth_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMPTZ,
        scope TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(institution_id, provider)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_oauth_connections_institution_id
        ON oauth_connections(institution_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oauth_connections`);
    await queryRunner.query(`DROP TABLE IF EXISTS webhook_endpoints`);
    await queryRunner.query(`DROP TABLE IF EXISTS api_keys`);
    await queryRunner.query(`DROP TABLE IF EXISTS institution_users`);
  }
}
