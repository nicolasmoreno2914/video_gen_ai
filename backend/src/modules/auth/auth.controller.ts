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

interface AuthRequest extends Request {
  supabaseUser: User;
}

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('onboarding/create-institution')
  @UseGuards(SupabaseAuthGuard)
  async createInstitution(
    @Req() req: AuthRequest,
    @Body() body: { name: string; slug: string },
  ) {
    const institution = await this.authService.createInstitution({
      name: body.name,
      slug: body.slug,
      supabaseUserId: req.supabaseUser.id,
    });
    return institution;
  }

  @Get('institutions/current')
  @UseGuards(SupabaseAuthGuard)
  async getCurrentInstitution(@Req() req: AuthRequest) {
    return this.authService.getInstitutionByUserId(req.supabaseUser.id);
  }

  @Post('institutions/current/api-keys')
  @UseGuards(SupabaseAuthGuard)
  async generateApiKey(
    @Req() req: AuthRequest,
    @Body() body: { label?: string },
  ) {
    const institution = await this.authService.getInstitutionByUserId(req.supabaseUser.id);
    return this.authService.generateApiKey(institution.id, body.label ?? 'default');
  }

  @Get('institutions/current/api-keys')
  @UseGuards(SupabaseAuthGuard)
  async listApiKeys(@Req() req: AuthRequest) {
    const institution = await this.authService.getInstitutionByUserId(req.supabaseUser.id);
    return this.authService.listApiKeys(institution.id);
  }

  @Delete('institutions/current/api-keys/:keyId')
  @UseGuards(SupabaseAuthGuard)
  async revokeApiKey(@Req() req: AuthRequest, @Param('keyId') keyId: string) {
    const institution = await this.authService.getInstitutionByUserId(req.supabaseUser.id);
    await this.authService.revokeApiKey(institution.id, keyId);
    return { success: true };
  }
}
