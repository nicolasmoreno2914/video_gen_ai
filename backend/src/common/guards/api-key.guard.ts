import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<AppConfig>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('API key requerida en el header Authorization: Bearer {key}');
    }

    const providedKey = authHeader.substring(7);
    const expectedKey = this.configService.get<string>('secret');

    if (!expectedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException('API key inválida');
    }

    return true;
  }
}
