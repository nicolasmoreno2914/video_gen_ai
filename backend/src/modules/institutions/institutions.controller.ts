import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { InstitutionsService } from './institutions.service';
import { DualAuthGuard } from '../../common/guards/dual-auth.guard';
import { Institution } from '../database/entities/institution.entity';

@Controller('institutions')
@UseGuards(DualAuthGuard)
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Post()
  create(@Body() body: Partial<Institution>): Promise<Institution> {
    return this.institutionsService.create(body);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Institution | null> {
    return this.institutionsService.findById(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: Partial<Institution>,
  ): Promise<Institution> {
    return this.institutionsService.update(id, body);
  }
}
