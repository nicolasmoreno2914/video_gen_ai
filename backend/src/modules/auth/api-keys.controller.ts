import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { User } from '@supabase/supabase-js';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { AuthService } from './auth.service';

type AuthRequest = Request & { supabaseUser: User };

@Controller('api-keys')
@UseGuards(SupabaseAuthGuard)
export class ApiKeysController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  async create(@Req() req: AuthRequest, @Body() body: { name: string }) {
    const institution = await this.authService.getInstitutionByUserId(req.supabaseUser.id);
    return this.authService.generateApiKey(institution.id, body.name ?? 'default');
  }

  @Get()
  async list(@Req() req: AuthRequest) {
    const institution = await this.authService.getInstitutionByUserId(req.supabaseUser.id);
    const items = await this.authService.listApiKeys(institution.id);
    return { items };
  }

  @Delete(':id')
  async revoke(@Req() req: AuthRequest, @Param('id') id: string) {
    const institution = await this.authService.getInstitutionByUserId(req.supabaseUser.id);
    await this.authService.revokeApiKey(institution.id, id);
    return { success: true, message: 'API Key revocada correctamente.' };
  }
}
