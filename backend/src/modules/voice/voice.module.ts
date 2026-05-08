import { Module } from '@nestjs/common';
import { ElevenLabsService } from './elevenlabs.service';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [VideosModule],
  providers: [ElevenLabsService],
  exports: [ElevenLabsService],
})
export class VoiceModule {}
