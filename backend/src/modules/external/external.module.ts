import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExternalController } from './external.controller';
import { VideosModule } from '../videos/videos.module';
import { VIDEO_QUEUE } from '../queue/queue.constants';
import { ExternalApiKeyGuard } from '../../common/guards/external-api-key.guard';

@Module({
  imports: [
    VideosModule,
    BullModule.registerQueue({ name: VIDEO_QUEUE }),
  ],
  controllers: [ExternalController],
  providers: [ExternalApiKeyGuard],
})
export class ExternalModule {}
