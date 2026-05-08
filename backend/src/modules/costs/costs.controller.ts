import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CostsService } from './costs.service';
import { CostSummaryQueryDto, CostVideosQueryDto } from './dto/cost-query.dto';
import { DualAuthGuard } from '../../common/guards/dual-auth.guard';
import { Institution } from '../database/entities/institution.entity';

type AuthRequest = Request & { institution?: Institution };

@Controller('costs')
@UseGuards(DualAuthGuard)
export class CostsController {
  private readonly logger = new Logger(CostsController.name);

  constructor(private readonly costsService: CostsService) {}

  // GET /api/costs/summary
  @Get('summary')
  async getSummary(@Req() req: AuthRequest, @Query() query: CostSummaryQueryDto) {
    const institutionId = req.institution?.id;
    return this.costsService.getCostSummary(query.from, query.to, institutionId);
  }

  // GET /api/costs/videos
  @Get('videos')
  async getVideoCosts(@Req() req: AuthRequest, @Query() query: CostVideosQueryDto) {
    const institutionId = req.institution?.id;
    // Override institution_id from auth context, ignoring any query param
    return this.costsService.getVideoCosts({ ...query, institution_id: institutionId });
  }

  // GET /api/costs/videos/:jobId
  @Get('videos/:jobId')
  async getVideoCostBreakdown(@Req() req: AuthRequest, @Param('jobId') jobId: string) {
    const institutionId = req.institution?.id;
    return this.costsService.getVideoCostBreakdown(jobId, institutionId);
  }

  // GET /api/costs/provider-breakdown
  @Get('provider-breakdown')
  async getProviderBreakdown(@Req() req: AuthRequest, @Query() query: CostSummaryQueryDto) {
    const institutionId = req.institution?.id;
    return this.costsService.getProviderBreakdown(query.from, query.to, institutionId);
  }

  // GET /api/costs/daily
  @Get('daily')
  async getDailyCosts(@Req() req: AuthRequest, @Query() query: CostSummaryQueryDto) {
    const institutionId = req.institution?.id;
    return this.costsService.getDailyCosts(query.from, query.to, institutionId);
  }

  // POST /api/costs/videos/:jobId/rebuild
  @Post('videos/:jobId/rebuild')
  @HttpCode(HttpStatus.OK)
  async rebuildCosts(@Req() req: AuthRequest, @Param('jobId') jobId: string) {
    const institutionId = req.institution?.id;
    await this.costsService.rebuildCostsForJob(jobId, institutionId);
    return { success: true, job_id: jobId };
  }
}
