import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Institution } from '../database/entities/institution.entity';
import { InstitutionUser } from '../database/entities/institution-user.entity';
import { ApiKey } from '../database/entities/api-key.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ApiKeysController } from './api-keys.controller';
import { SupabaseClientService } from './supabase-client.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { DualAuthGuard } from '../../common/guards/dual-auth.guard';
import { ExternalApiKeyGuard } from '../../common/guards/external-api-key.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Institution, InstitutionUser, ApiKey])],
  controllers: [AuthController, ApiKeysController],
  providers: [AuthService, SupabaseClientService, SupabaseAuthGuard, DualAuthGuard, ExternalApiKeyGuard],
  exports: [AuthService, SupabaseClientService, SupabaseAuthGuard, DualAuthGuard, ExternalApiKeyGuard],
})
export class AuthModule {}
