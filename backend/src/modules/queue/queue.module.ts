import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { VIDEO_QUEUE } from './queue.constants';
import { VideoProcessor } from './video.processor';
import { VideosModule } from '../videos/videos.module';
import { EventsModule } from '../events/events.module';
import { AiModule } from '../ai/ai.module';
import { ImageGeneratorModule } from '../image-generator/image-generator.module';
import { SlidesModule } from '../slides/slides.module';
import { VoiceModule } from '../voice/voice.module';
import { RendererModule } from '../renderer/renderer.module';
import { YouTubeModule } from '../youtube/youtube.module';
import { WebhookModule } from '../webhook/webhook.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { CostsModule } from '../costs/costs.module';
import { StorageModule } from '../storage/storage.module';
import { AppConfig } from '../../config/configuration';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        const redisUrl = config.get('redisUrl') as string | null;
        const redisConfig = config.get<AppConfig['redis']>('redis')!;

        // REDIS_URL takes priority (Upstash / Render Redis via rediss:// or redis://)
        const connection = redisUrl
          ? new IORedis(redisUrl, {
              maxRetriesPerRequest: null,
              enableReadyCheck: false,
              tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
            })
          : new IORedis({
              host: redisConfig.host,
              port: redisConfig.port,
              maxRetriesPerRequest: null,
            });

        return {
          connection,
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: false,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: VIDEO_QUEUE }),
    VideosModule,
    EventsModule,
    AiModule,
    ImageGeneratorModule,
    SlidesModule,
    VoiceModule,
    RendererModule,
    YouTubeModule,
    WebhookModule,
    InstitutionsModule,
    CostsModule,
    StorageModule,
  ],
  providers: [VideoProcessor],
  exports: [BullModule],
})
export class QueueModule {}
