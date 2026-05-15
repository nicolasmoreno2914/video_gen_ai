import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { DatabaseModule } from './modules/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { InstitutionsModule } from './modules/institutions/institutions.module';
import { VideosModule } from './modules/videos/videos.module';
import { QueueModule } from './modules/queue/queue.module';
import { EventsModule } from './modules/events/events.module';
import { AiModule } from './modules/ai/ai.module';
import { ImageGeneratorModule } from './modules/image-generator/image-generator.module';
import { SlidesModule } from './modules/slides/slides.module';
import { VoiceModule } from './modules/voice/voice.module';
import { RendererModule } from './modules/renderer/renderer.module';
import { YouTubeModule } from './modules/youtube/youtube.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { CostsModule } from './modules/costs/costs.module';
import { AuthModule } from './modules/auth/auth.module';
import { ExternalModule } from './modules/external/external.module';
import { StorageModule } from './modules/storage/storage.module';
import { CursiaModule } from './modules/cursia/cursia.module';
import { TempStorageModule } from './modules/temp-storage/temp-storage.module';
import { DevController } from './modules/videos/dev.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    HealthModule,
    InstitutionsModule,
    VideosModule,
    QueueModule,
    EventsModule,
    AiModule,
    ImageGeneratorModule,
    SlidesModule,
    VoiceModule,
    RendererModule,
    YouTubeModule,
    WebhookModule,
    CostsModule,
    AuthModule,
    ExternalModule,
    StorageModule,
    TempStorageModule,
    CursiaModule,
  ],
  controllers: [DevController],
})
export class AppModule {}
