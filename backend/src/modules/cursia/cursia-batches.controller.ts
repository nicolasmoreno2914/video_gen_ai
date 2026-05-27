import {
  Controller, Post, Get, Param, Body, UseGuards,
  NotFoundException, HttpCode, HttpStatus,
} from '@nestjs/common';
import { CursiaHmacGuard } from './guards/cursia-hmac.guard';
import { CursiaBatchesService } from './services/cursia-batches.service';
import { CreateBatchDto } from './dto/create-batch.dto';

@Controller('api/v1/video-batches')
export class CursiaBatchesController {
  constructor(private readonly svc: CursiaBatchesService) {}

  @Post()
  @UseGuards(CursiaHmacGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  createBatch(@Body() dto: CreateBatchDto) {
    return this.svc.createBatch(dto);
  }

  @Get('by-request/:requestId')
  @UseGuards(CursiaHmacGuard)
  async getByRequestId(@Param('requestId') requestId: string) {
    const result = await this.svc.getBatchByRequestId(requestId);
    if (!result) throw new NotFoundException({ success: false, code: 'NOT_FOUND', message: 'Batch not found' });
    return result;
  }

  @Get(':batchId')
  @UseGuards(CursiaHmacGuard)
  async getById(@Param('batchId') batchId: string) {
    const result = await this.svc.getBatchById(batchId);
    if (!result) throw new NotFoundException({ success: false, code: 'NOT_FOUND', message: 'Batch not found' });
    return result;
  }
}
