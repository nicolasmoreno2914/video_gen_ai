import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service';
import { Institution } from '../../modules/database/entities/institution.entity';

export type ExternalRequest = Request & {
  institution: Institution;
  institution_id: string;
  auth_type: 'api_key';
};

@Injectable()
export class ExternalApiKeyGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ExternalRequest>();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization: Bearer veia_live_... requerido');
    }

    const key = authHeader.substring(7);

    if (!key.startsWith('veia_live_')) {
      throw new UnauthorizedException('Formato de API Key inválido');
    }

    const result = await this.authService.validateApiKeyHashWithRecord(key);

    if (!result) {
      throw new UnauthorizedException('API Key inválida o revocada');
    }

    request.institution = result.institution;
    request.institution_id = result.institution.id;
    request.auth_type = 'api_key';

    return true;
  }
}
