import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AppConfig } from '../../config/configuration';
import { AuthService } from '../../modules/auth/auth.service';
import { SupabaseClientService } from '../../modules/auth/supabase-client.service';
import { Institution } from '../../modules/database/entities/institution.entity';

type AuthRequest = Request & {
  supabaseUser?: unknown;
  institution?: Institution;
};

@Injectable()
export class DualAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly authService: AuthService,
    private readonly supabaseClientService: SupabaseClientService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.configService.get<boolean>('skipAuth')) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization: Bearer {token|api_key} requerido');
    }

    const credential = authHeader.substring(7);
    const isJwt = credential.split('.').length === 3;

    if (isJwt) {
      return this.validateJwt(request, credential);
    }

    return this.validateApiKey(request, credential);
  }

  private async validateJwt(request: AuthRequest, token: string): Promise<boolean> {
    const { data, error } = await this.supabaseClientService.supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Token JWT inválido o expirado');
    }

    request.supabaseUser = data.user;

    const institution = await this.authService.findInstitutionBySupabaseUser(data.user.id);
    if (institution) request.institution = institution;

    return true;
  }

  private async validateApiKey(request: AuthRequest, key: string): Promise<boolean> {
    const staticKey = this.configService.get<string>('secret');
    if (staticKey && key === staticKey) {
      return true;
    }

    const institution = await this.authService.validateApiKeyHash(key);
    if (!institution) {
      throw new UnauthorizedException('API key inválida');
    }

    request.institution = institution;
    return true;
  }
}
