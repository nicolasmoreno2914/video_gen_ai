import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { VideoJob } from '../database/entities/video-job.entity';
import { VideoScene } from '../database/entities/video-scene.entity';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { CleanupService } from './cleanup.service';
import { InstitutionsModule } from '../institutions/institutions.module';
import { EventsModule } from '../events/events.module';
import { VIDEO_QUEUE } from '../queue/queue.constants';
@Module({
  imports: [
    TypeOrmModule.forFeature([VideoJob, VideoScene, ApiUsageLog]),
    BullModule.registerQueue({ name: VIDEO_QUEUE }),
    InstitutionsModule,
    EventsModule,
  ],
  controllers: [VideosController],
  providers: [VideosService, CleanupService],
  exports: [VideosService, TypeOrmModule],
})
export class VideosModule {}
