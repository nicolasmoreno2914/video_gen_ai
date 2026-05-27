import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { Institution } from '../database/entities/institution.entity';
import { InstitutionUser } from '../database/entities/institution-user.entity';
import { ApiKey } from '../database/entities/api-key.entity';

export interface CreateInstitutionDto {
  name: string;
  slug: string;
  supabaseUserId: string;
}

export interface ApiKeyCreatedResponse {
  id: string;
  name: string;
  api_key: string;
  key_prefix: string;
  created_at: Date;
  message: string;
}

export interface ApiKeyListItem {
  id: string;
  name: string;
  key_prefix: string | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Institution)
    private readonly institutionRepo: Repository<Institution>,
    @InjectRepository(InstitutionUser)
    private readonly institutionUserRepo: Repository<InstitutionUser>,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
  ) {}

  async createInstitution(dto: CreateInstitutionDto): Promise<Institution> {
    const existing = await this.institutionRepo.findOne({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`El slug "${dto.slug}" ya está en uso`);
    }

    const institution = this.institutionRepo.create({ name: dto.name, slug: dto.slug });
    const saved = await this.institutionRepo.save(institution);

    const user = this.institutionUserRepo.create({
      institution_id: saved.id,
      supabase_user_id: dto.supabaseUserId,
      role: 'admin',
    });
    await this.institutionUserRepo.save(user);

    return saved;
  }

  async getInstitutionByUserId(supabaseUserId: string): Promise<Institution> {
    const user = await this.institutionUserRepo.findOne({
      where: { supabase_user_id: supabaseUserId },
      relations: ['institution'],
    });
    if (!user) throw new NotFoundException('No se encontró ninguna institución para este usuario');
    return user.institution;
  }

  async findInstitutionBySupabaseUser(supabaseUserId: string): Promise<Institution | null> {
    const user = await this.institutionUserRepo.findOne({
      where: { supabase_user_id: supabaseUserId },
      relations: ['institution'],
    });
    return user?.institution ?? null;
  }

  async generateApiKey(institutionId: string, name: string): Promise<ApiKeyCreatedResponse> {
    const rawKey = `veia_live_${randomBytes(32).toString('hex')}`;
    const hash = createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.substring(0, 20) + '...';

    const record = this.apiKeyRepo.create({
      institution_id: institutionId,
      key_hash: hash,
      key_prefix: prefix,
      label: name,
      is_active: true,
      revoked_at: null,
    });
    const saved = await this.apiKeyRepo.save(record);

    return {
      id: saved.id,
      name: saved.label,
      api_key: rawKey,
      key_prefix: prefix,
      created_at: saved.created_at,
      message: 'Guarda esta API Key ahora. No podrás verla nuevamente.',
    };
  }

  async listApiKeys(institutionId: string): Promise<ApiKeyListItem[]> {
    const keys = await this.apiKeyRepo.find({
      where: { institution_id: institutionId },
      order: { created_at: 'DESC' },
    });
    return keys.map((k) => ({
      id: k.id,
      name: k.label,
      key_prefix: k.key_prefix,
      last_used_at: k.last_used_at,
      revoked_at: k.revoked_at,
      created_at: k.created_at,
    }));
  }

  async revokeApiKey(institutionId: string, keyId: string): Promise<void> {
    const record = await this.apiKeyRepo.findOne({
      where: { id: keyId, institution_id: institutionId },
    });
    if (!record) throw new NotFoundException('API key no encontrada');
    await this.apiKeyRepo.update(keyId, { revoked_at: new Date(), is_active: false });
  }

  async validateApiKeyHash(key: string): Promise<Institution | null> {
    const hash = createHash('sha256').update(key).digest('hex');
    const record = await this.apiKeyRepo.findOne({
      where: { key_hash: hash, is_active: true, revoked_at: IsNull() },
      relations: ['institution'],
    });
    if (!record) return null;
    this.apiKeyRepo.update(record.id, { last_used_at: new Date() }).catch(() => undefined);
    return record.institution;
  }

  async validateApiKeyHashWithRecord(key: string): Promise<{ institution: Institution; keyId: string } | null> {
    const hash = createHash('sha256').update(key).digest('hex');
    const record = await this.apiKeyRepo.findOne({
      where: { key_hash: hash, is_active: true, revoked_at: IsNull() },
      relations: ['institution'],
    });
    if (!record) return null;
    this.apiKeyRepo.update(record.id, { last_used_at: new Date() }).catch(() => undefined);
    return { institution: record.institution, keyId: record.id };
  }
}
