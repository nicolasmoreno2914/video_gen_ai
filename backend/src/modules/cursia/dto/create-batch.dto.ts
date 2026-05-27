import { Type } from 'class-transformer';
import {
  IsArray, IsNumber, IsObject, IsOptional, IsString, IsUrl,
  Min, Max, ArrayMinSize, ArrayMaxSize, ValidateNested, MinLength,
} from 'class-validator';

export class VideoItemDto {
  @IsNumber()
  @Min(1)
  chapter_number: number;

  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  script: string;

  @IsNumber()
  @IsOptional()
  duration_hint_seconds?: number;
}

export class BatchOptionsDto {
  @IsString() @IsOptional() language?: string;
  @IsString() @IsOptional() style?: string;
  @IsString() @IsOptional() format?: string;
  @IsString() @IsOptional() resolution?: string;
}

export class CreateBatchDto {
  @IsString()
  @MinLength(1)
  request_id: string;

  @IsString()
  @IsOptional()
  course_id?: string;

  @IsUrl()
  callback_url: string;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => BatchOptionsDto)
  options?: BatchOptionsDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @ValidateNested({ each: true })
  @Type(() => VideoItemDto)
  videos: VideoItemDto[];
}
