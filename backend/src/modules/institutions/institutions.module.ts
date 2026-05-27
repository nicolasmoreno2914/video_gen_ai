import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Institution } from '../database/entities/institution.entity';
import { VideoJob } from '../database/entities/video-job.entity';
import { InstitutionsService } from './institutions.service';
import { InstitutionsController } from './institutions.controller';
@Module({
  imports: [TypeOrmModule.forFeature([Institution, VideoJob])],
  controllers: [InstitutionsController],
  providers: [InstitutionsService],
  exports: [InstitutionsService],
})
export class InstitutionsModule {}
