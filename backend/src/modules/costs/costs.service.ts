import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { VideoJob } from '../database/entities/video-job.entity';
import { CostVideosQueryDto } from './dto/cost-query.dto';

// ---------------------------------------------------------------------------
// Response shape types
// ---------------------------------------------------------------------------

export interface CostBreakdown {
  openai_text: number;
  openai_images: number;
  elevenlabs: number;
  render: number;
  youtube: number;
}

export interface CostUsage {
  text_tokens_input: number;
  text_tokens_output: number;
  images_generated: number;
  elevenlabs_characters: number;
  render_seconds: number;
  youtube_uploads: number;
}

export interface CostSummaryResponse {
  total_cost: number;
  total_videos: number;
  average_cost_per_video: number;
  total_duration_seconds: number;
  breakdown: CostBreakdown;
  usage: CostUsage;
}

export interface VideoCostItem {
  job_id: string;
  title: string;
  status: string;
  duration_seconds: number | null;
  scenes_count: number | null;
  ai_images_count: number;
  created_at: Date;
  total_cost: number;
  breakdown: CostBreakdown;
}

export interface ApiUsageLogRow {
  id: string;
  provider: string;
  operation: string;
  model_name: string | null;
  unit_type: string | null;
  input_units: number | null;
  output_units: number | null;
  estimated_cost: number | null;
  created_at: Date;
}

export interface VideoCostDetail {
  job_id: string;
  title: string;
  status: string;
  duration_seconds: number | null;
  scenes_count: number | null;
  estimated_total_cost: number;
  breakdown: CostBreakdown;
  cost_per_minute: number | null;
  cost_per_scene: number | null;
  usage_logs: ApiUsageLogRow[];
}

export interface ProviderStat {
  provider: string;
  operation: string;
  total_cost: number;
  total_calls: number;
  total_input_units: number;
  total_output_units: number;
}

export interface ProviderBreakdownResponse {
  providers: ProviderStat[];
  totals: CostBreakdown;
}

export interface DailyCostEntry {
  date: string;
  total_cost: number;
  breakdown: CostBreakdown;
}

// ---------------------------------------------------------------------------
// Provider → category mapping
// ---------------------------------------------------------------------------

const PROVIDER_CATEGORY: Record<string, keyof CostBreakdown> = {
  openai_chat: 'openai_text',
  openai_dalle: 'openai_images',
  elevenlabs: 'elevenlabs',
  internal: 'render',
  youtube: 'youtube',
};

function emptyBreakdown(): CostBreakdown {
  return {
    openai_text: 0,
    openai_images: 0,
    elevenlabs: 0,
    render: 0,
    youtube: 0,
  };
}

function providerCategory(provider: string): keyof CostBreakdown {
  return PROVIDER_CATEGORY[provider] ?? 'render';
}

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

function defaultDateRange(from?: string, to?: string): { fromDate: Date; toDate: Date } {
  const toDate = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
  const fromDate = from
    ? new Date(`${from}T00:00:00.000Z`)
    : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { fromDate, toDate };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class CostsService {
  private readonly logger = new Logger(CostsService.name);

  constructor(
    @InjectRepository(ApiUsageLog)
    private readonly apiUsageLogRepo: Repository<ApiUsageLog>,
    @InjectRepository(VideoJob)
    private readonly videoJobRepo: Repository<VideoJob>,
  ) {}

  // -------------------------------------------------------------------------
  // getCostSummary
  // -------------------------------------------------------------------------

  async getCostSummary(
    from?: string,
    to?: string,
    institutionId?: string,
  ): Promise<CostSummaryResponse> {
    const { fromDate, toDate } = defaultDateRange(from, to);

    const qb = this.apiUsageLogRepo
      .createQueryBuilder('log')
      .where('log.created_at BETWEEN :from AND :to', {
        from: fromDate,
        to: toDate,
      });

    if (institutionId) {
      qb.andWhere('log.institution_id = :institutionId', { institutionId });
    }

    const rows = await qb
      .select([
        'log.provider AS provider',
        'log.operation AS operation',
        'SUM(COALESCE(log.estimated_cost, 0)) AS total_cost',
        'SUM(COALESCE(log.input_units, 0)) AS total_input',
        'SUM(COALESCE(log.output_units, 0)) AS total_output',
        'COUNT(*) AS call_count',
      ])
      .groupBy('log.provider')
      .addGroupBy('log.operation')
      .getRawMany<{
        provider: string;
        operation: string;
        total_cost: string;
        total_input: string;
        total_output: string;
        call_count: string;
      }>();

    // Distinct video count
    const distinctVideos = await qb
      .clone()
      .select('COUNT(DISTINCT log.video_job_id)', 'cnt')
      .getRawOne<{ cnt: string }>();

    // Duration sum from video_jobs in range
    const durationResult = await this.videoJobRepo
      .createQueryBuilder('job')
      .select('SUM(COALESCE(job.duration_seconds, 0))', 'total')
      .where('job.created_at BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .andWhere(institutionId ? 'job.institution_id = :institutionId' : '1=1', {
        institutionId,
      })
      .getRawOne<{ total: string }>();

    const breakdown = emptyBreakdown();
    const usage: CostUsage = {
      text_tokens_input: 0,
      text_tokens_output: 0,
      images_generated: 0,
      elevenlabs_characters: 0,
      render_seconds: 0,
      youtube_uploads: 0,
    };

    for (const row of rows) {
      const cost = parseFloat(row.total_cost) || 0;
      const inputUnits = parseInt(row.total_input, 10) || 0;
      const outputUnits = parseInt(row.total_output, 10) || 0;
      const calls = parseInt(row.call_count, 10) || 0;
      const cat = providerCategory(row.provider);
      breakdown[cat] += cost;

      if (row.provider === 'openai_chat') {
        usage.text_tokens_input += inputUnits;
        usage.text_tokens_output += outputUnits;
      } else if (row.provider === 'openai_dalle') {
        usage.images_generated += calls;
      } else if (row.provider === 'elevenlabs') {
        usage.elevenlabs_characters += inputUnits;
      } else if (row.provider === 'internal') {
        usage.render_seconds += inputUnits;
      } else if (row.provider === 'youtube') {
        usage.youtube_uploads += calls;
      }
    }

    const totalCost = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const totalVideos = parseInt(distinctVideos?.cnt ?? '0', 10);
    const totalDuration = parseFloat(durationResult?.total ?? '0') || 0;

    return {
      total_cost: Math.round(totalCost * 1_000_000) / 1_000_000,
      total_videos: totalVideos,
      average_cost_per_video: totalVideos > 0 ? Math.round((totalCost / totalVideos) * 1_000_000) / 1_000_000 : 0,
      total_duration_seconds: totalDuration,
      breakdown,
      usage,
    };
  }

  // -------------------------------------------------------------------------
  // getVideoCosts
  // -------------------------------------------------------------------------

  async getVideoCosts(
    query: CostVideosQueryDto,
  ): Promise<{ items: VideoCostItem[]; pagination: { page: number; limit: number; total: number; total_pages: number } }> {
    const { from, to, institution_id, page = 1, limit = 20, sort_by = 'created_at', sort_order = 'desc' } = query;
    const { fromDate, toDate } = defaultDateRange(from, to);

    const jobQb = this.videoJobRepo
      .createQueryBuilder('job')
      .where('job.created_at BETWEEN :from AND :to', { from: fromDate, to: toDate });

    if (institution_id) {
      jobQb.andWhere('job.institution_id = :institutionId', { institutionId: institution_id });
    }

    const total = await jobQb.clone().getCount();

    // Sort column mapping
    const sortColumnMap: Record<string, string> = {
      created_at: 'job.created_at',
      duration_seconds: 'job.duration_seconds',
      total_cost: 'job.estimated_total_cost',
    };
    const sortColumn = sortColumnMap[sort_by] ?? 'job.created_at';

    jobQb
      .orderBy(sortColumn, sort_order.toUpperCase() as 'ASC' | 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const jobs = await jobQb.getMany();

    if (jobs.length === 0) {
      return {
        items: [],
        pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
      };
    }

    const jobIds = jobs.map((j) => j.id);

    // Aggregate costs + image count per job
    const logRows = await this.apiUsageLogRepo
      .createQueryBuilder('log')
      .select('log.video_job_id', 'job_id')
      .addSelect('log.provider', 'provider')
      .addSelect('SUM(COALESCE(log.estimated_cost, 0))', 'cost')
      .addSelect("SUM(CASE WHEN log.provider = 'openai_dalle' THEN COALESCE(log.input_units, 0) ELSE 0 END)", 'image_count')
      .where('log.video_job_id IN (:...jobIds)', { jobIds })
      .groupBy('log.video_job_id')
      .addGroupBy('log.provider')
      .getRawMany<{ job_id: string; provider: string; cost: string; image_count: string }>();

    // Build cost map + image count per job
    const costMap = new Map<string, CostBreakdown>();
    const imageCountMap = new Map<string, number>();
    for (const row of logRows) {
      if (!costMap.has(row.job_id)) {
        costMap.set(row.job_id, emptyBreakdown());
        imageCountMap.set(row.job_id, 0);
      }
      const bd = costMap.get(row.job_id)!;
      const cat = providerCategory(row.provider);
      bd[cat] += parseFloat(row.cost) || 0;
      if (row.provider === 'openai_dalle') {
        imageCountMap.set(row.job_id, parseInt(row.image_count, 10) || 0);
      }
    }

    const items: VideoCostItem[] = jobs.map((job) => {
      const bd = costMap.get(job.id) ?? emptyBreakdown();
      const totalCost = Object.values(bd).reduce((a, b) => a + b, 0);
      return {
        job_id: job.id,
        title: job.title,
        status: job.status,
        duration_seconds: job.duration_seconds,
        scenes_count: job.scenes_count,
        ai_images_count: imageCountMap.get(job.id) ?? 0,
        created_at: job.created_at,
        total_cost: Math.round(totalCost * 1_000_000) / 1_000_000,
        breakdown: bd,
      };
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  // -------------------------------------------------------------------------
  // getVideoCostBreakdown
  // -------------------------------------------------------------------------

  async getVideoCostBreakdown(jobId: string, institutionId?: string): Promise<VideoCostDetail> {
    const job = await this.videoJobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`VideoJob ${jobId} no encontrado`);
    if (institutionId && job.institution_id !== institutionId) {
      throw new ForbiddenException('Access denied');
    }

    const logs = await this.apiUsageLogRepo.find({
      where: { video_job_id: jobId },
      order: { created_at: 'ASC' },
    });

    const breakdown = emptyBreakdown();
    const usageLogs: ApiUsageLogRow[] = logs.map((log) => {
      const cost = Number(log.estimated_cost) || 0;
      const cat = providerCategory(log.provider);
      breakdown[cat] += cost;
      return {
        id: log.id,
        provider: log.provider,
        operation: log.operation,
        model_name: log.model_name ?? null,
        unit_type: log.unit_type ?? null,
        input_units: log.input_units,
        output_units: log.output_units,
        estimated_cost: cost,
        created_at: log.created_at,
      };
    });

    const totalCost = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const costPerMinute =
      job.duration_seconds && job.duration_seconds > 0
        ? totalCost / (job.duration_seconds / 60)
        : null;
    const costPerScene =
      job.scenes_count && job.scenes_count > 0
        ? totalCost / job.scenes_count
        : null;

    return {
      job_id: job.id,
      title: job.title,
      status: job.status,
      duration_seconds: job.duration_seconds,
      scenes_count: job.scenes_count,
      estimated_total_cost: Math.round(totalCost * 1_000_000) / 1_000_000,
      breakdown,
      cost_per_minute: costPerMinute !== null ? Math.round(costPerMinute * 1_000_000) / 1_000_000 : null,
      cost_per_scene: costPerScene !== null ? Math.round(costPerScene * 1_000_000) / 1_000_000 : null,
      usage_logs: usageLogs,
    };
  }

  // -------------------------------------------------------------------------
  // getProviderBreakdown
  // -------------------------------------------------------------------------

  async getProviderBreakdown(
    from?: string,
    to?: string,
    institutionId?: string,
  ): Promise<ProviderBreakdownResponse> {
    const { fromDate, toDate } = defaultDateRange(from, to);

    const qb = this.apiUsageLogRepo
      .createQueryBuilder('log')
      .where('log.created_at BETWEEN :from AND :to', { from: fromDate, to: toDate });

    if (institutionId) {
      qb.andWhere('log.institution_id = :institutionId', { institutionId });
    }

    const rows = await qb
      .select('log.provider', 'provider')
      .addSelect('log.operation', 'operation')
      .addSelect('SUM(COALESCE(log.estimated_cost, 0))', 'total_cost')
      .addSelect('COUNT(*)', 'total_calls')
      .addSelect('SUM(COALESCE(log.input_units, 0))', 'total_input_units')
      .addSelect('SUM(COALESCE(log.output_units, 0))', 'total_output_units')
      .groupBy('log.provider')
      .addGroupBy('log.operation')
      .orderBy('total_cost', 'DESC')
      .getRawMany<{
        provider: string;
        operation: string;
        total_cost: string;
        total_calls: string;
        total_input_units: string;
        total_output_units: string;
      }>();

    const totals = emptyBreakdown();
    const providers: ProviderStat[] = rows.map((row) => {
      const cost = parseFloat(row.total_cost) || 0;
      const cat = providerCategory(row.provider);
      totals[cat] += cost;
      return {
        provider: row.provider,
        operation: row.operation,
        total_cost: Math.round(cost * 1_000_000) / 1_000_000,
        total_calls: parseInt(row.total_calls, 10) || 0,
        total_input_units: parseInt(row.total_input_units, 10) || 0,
        total_output_units: parseInt(row.total_output_units, 10) || 0,
      };
    });

    return { providers, totals };
  }

  // -------------------------------------------------------------------------
  // getDailyCosts
  // -------------------------------------------------------------------------

  async getDailyCosts(from?: string, to?: string, institutionId?: string): Promise<DailyCostEntry[]> {
    const { fromDate, toDate } = defaultDateRange(from, to);

    const qb = this.apiUsageLogRepo
      .createQueryBuilder('log')
      .where('log.created_at BETWEEN :from AND :to', { from: fromDate, to: toDate });

    if (institutionId) {
      qb.andWhere('log.institution_id = :institutionId', { institutionId });
    }

    const rows = await qb
      .select("DATE(log.created_at)", 'date')
      .addSelect('log.provider', 'provider')
      .addSelect('SUM(COALESCE(log.estimated_cost, 0))', 'total_cost')
      .groupBy("DATE(log.created_at)")
      .addGroupBy('log.provider')
      .orderBy("DATE(log.created_at)", 'ASC')
      .getRawMany<{ date: string; provider: string; total_cost: string }>();

    // Aggregate into per-date map
    const dateMap = new Map<string, CostBreakdown>();
    for (const row of rows) {
      const dateKey = typeof row.date === 'string'
        ? row.date.slice(0, 10)
        : (row.date as Date).toISOString().slice(0, 10);
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, emptyBreakdown());
      }
      const bd = dateMap.get(dateKey)!;
      const cat = providerCategory(row.provider);
      bd[cat] += parseFloat(row.total_cost) || 0;
    }

    const result: DailyCostEntry[] = [];
    for (const [date, breakdown] of dateMap.entries()) {
      const total_cost = Object.values(breakdown).reduce((a, b) => a + b, 0);
      result.push({
        date,
        total_cost: Math.round(total_cost * 1_000_000) / 1_000_000,
        breakdown,
      });
    }

    return result.sort((a, b) => a.date.localeCompare(b.date));
  }

  // -------------------------------------------------------------------------
  // rebuildCostsForJob
  // -------------------------------------------------------------------------

  async rebuildCostsForJob(jobId: string, institutionId?: string): Promise<void> {
    const job = await this.videoJobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`VideoJob ${jobId} no encontrado`);
    if (institutionId && job.institution_id !== institutionId) {
      throw new ForbiddenException('Access denied');
    }

    const logs = await this.apiUsageLogRepo.find({ where: { video_job_id: jobId } });

    const breakdown = emptyBreakdown();
    for (const log of logs) {
      const cat = providerCategory(log.provider);
      breakdown[cat] += Number(log.estimated_cost) || 0;
    }

    const totalCost = Object.values(breakdown).reduce((a, b) => a + b, 0);

    await this.videoJobRepo.update(jobId, {
      estimated_total_cost: Math.round(totalCost * 1_000_000) / 1_000_000,
      cost_breakdown: breakdown as unknown as Record<string, number>,
    });

    this.logger.log(`[CostsService] [${jobId}] Costos recalculados — total: $${totalCost.toFixed(6)}`);
  }

  // -------------------------------------------------------------------------
  // calculateAndSaveJobCosts — called after job completes
  // -------------------------------------------------------------------------

  async calculateAndSaveJobCosts(jobId: string): Promise<void> {
    try {
      await this.rebuildCostsForJob(jobId);
    } catch (err) {
      this.logger.error(
        `[CostsService] [${jobId}] Error al calcular costos del job: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
