import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { User } from '@supabase/supabase-js';
import { SupabaseClientService } from '../../modules/auth/supabase-client.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabaseClientService: SupabaseClientService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('JWT requerido en Authorization: Bearer {token}');
    }

    const token = authHeader.substring(7);
    const { data, error } = await this.supabaseClientService.supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Token JWT inválido o expirado');
    }

    (request as Request & { supabaseUser: User }).supabaseUser = data.user;
    return true;
  }
}
