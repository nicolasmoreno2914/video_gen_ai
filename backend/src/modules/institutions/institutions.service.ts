import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Institution } from '../database/entities/institution.entity';
import { VideoJob } from '../database/entities/video-job.entity';

@Injectable()
export class InstitutionsService {
  private readonly logger = new Logger(InstitutionsService.name);

  constructor(
    @InjectRepository(Institution)
    private readonly institutionRepo: Repository<Institution>,
    @InjectRepository(VideoJob)
    private readonly videoJobRepo: Repository<VideoJob>,
  ) {}

  async findById(id: string): Promise<Institution | null> {
    return this.institutionRepo.findOne({ where: { id } });
  }

  async findByIdOrFail(id: string): Promise<Institution> {
    const inst = await this.institutionRepo.findOne({ where: { id } });
    if (!inst) throw new NotFoundException(`Institución ${id} no encontrada`);
    return inst;
  }

  async checkRateLimit(
    institutionId: string,
  ): Promise<{ allowed: boolean; used: number; limit: number }> {
    const institution = await this.findByIdOrFail(institutionId);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const used = await this.videoJobRepo
      .createQueryBuilder('job')
      .where('job.institution_id = :id', { id: institutionId })
      .andWhere('job.created_at >= :start', { start: startOfDay })
      .andWhere("job.status NOT IN ('failed')")
      .getCount();

    const limit = institution.daily_video_limit;
    const allowed = used < limit;

    if (!allowed) {
      this.logger.warn(
        `[InstitutionsService] [${institutionId}] Rate limit alcanzado: ${used}/${limit}`,
      );
    }

    return { allowed, used, limit };
  }

  async create(data: Partial<Institution>): Promise<Institution> {
    const inst = this.institutionRepo.create(data);
    return this.institutionRepo.save(inst);
  }

  async update(id: string, data: Omit<Partial<Institution>, 'video_jobs'>): Promise<Institution> {
    await this.institutionRepo.update(id, data as Parameters<typeof this.institutionRepo.update>[1]);
    return this.findByIdOrFail(id);
  }
}
