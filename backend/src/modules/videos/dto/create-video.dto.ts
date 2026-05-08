import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

class BrandDto {
  @IsOptional()
  @IsString()
  logo_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  primary_color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  secondary_color?: string;

  @IsString()
  institution_name!: string;

  @IsOptional()
  @IsString()
  voice_id?: string;
}

class YoutubeDto {
  @IsOptional()
  @IsIn(['public', 'unlisted', 'private'])
  privacy_status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateVideoDto {
  @IsOptional()
  @IsString()
  institution_id?: string;

  @IsString()
  course_id!: string;

  @IsString()
  chapter_id!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(80000)
  content_txt!: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(30)
  target_duration_minutes?: number;

  @IsOptional()
  @IsIn(['notebooklm', 'whiteboard', 'sketch'])
  visual_style?: string;

  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;

  @IsOptional()
  @IsObject()
  @Type(() => BrandDto)
  brand?: BrandDto;

  @IsOptional()
  @IsObject()
  @Type(() => YoutubeDto)
  youtube?: YoutubeDto;

  @IsOptional()
  @IsString()
  callback_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source_system?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  client_reference_id?: string;

  @IsOptional()
  @IsUUID()
  batch_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  batch_reference_id?: string;

  @IsOptional()
  @IsObject()
  external_metadata?: Record<string, unknown>;
}
