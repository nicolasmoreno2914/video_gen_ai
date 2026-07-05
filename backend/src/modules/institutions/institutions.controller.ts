import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';
import { InstitutionsService } from './institutions.service';
import { StorageService } from '../storage/storage.service';
import { DualAuthGuard } from '../../common/guards/dual-auth.guard';
import { Institution } from '../database/entities/institution.entity';

type AuthRequest = Request & { institution?: Institution };

class UpdateBrandDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  brand_institution_name?: string;

  @IsOptional()
  @IsHexColor()
  brand_primary_color?: string;

  @IsOptional()
  @IsHexColor()
  brand_secondary_color?: string;
}

const ALLOWED_LOGO_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

@Controller('institutions')
@UseGuards(DualAuthGuard)
export class InstitutionsController {
  constructor(
    private readonly institutionsService: InstitutionsService,
    private readonly storageService: StorageService,
  ) {}

  @Get('current')
  getCurrent(@Req() req: AuthRequest): Institution {
    if (!req.institution) {
      throw new UnauthorizedException('No se encontró institución para este usuario');
    }
    return req.institution;
  }

  @Post('current/logo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadLogo(
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ logo_url: string }> {
    if (!req.institution) throw new UnauthorizedException();
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    if (!ALLOWED_LOGO_MIME.has(file.mimetype)) {
      throw new BadRequestException('Solo se permiten imágenes PNG, JPEG o WebP');
    }
    if (file.size > MAX_LOGO_BYTES) {
      throw new BadRequestException('El logo no puede superar 2 MB');
    }

    const ext = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
    const key = `logos/${req.institution.id}/${Date.now()}.${ext}`;
    const url = await this.storageService.uploadBuffer(file.buffer, key, file.mimetype);

    await this.institutionsService.update(req.institution.id, { brand_logo_url: url });
    return { logo_url: url };
  }

  @Patch('current/brand')
  @HttpCode(HttpStatus.OK)
  async updateBrand(
    @Req() req: AuthRequest,
    @Body() body: UpdateBrandDto,
  ): Promise<Institution> {
    if (!req.institution) throw new UnauthorizedException();
    return this.institutionsService.update(req.institution.id, body);
  }

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
