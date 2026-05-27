import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as ws from 'ws';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class SupabaseClientService {
  private readonly client: SupabaseClient;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const url = this.configService.get<AppConfig['supabase']>('supabase')?.url ?? '';
    const key = this.configService.get<AppConfig['supabase']>('supabase')?.serviceRoleKey ?? '';

    this.client = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { transport: ws as unknown as typeof WebSocket },
    });
  }

  get supabase(): SupabaseClient {
    return this.client;
  }
}
