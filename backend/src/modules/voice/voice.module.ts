import { Module } from '@nestjs/common';
import { ElevenLabsService } from './elevenlabs.service';
import { OpenAiTtsService } from './openai-tts.service';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [VideosModule],
  providers: [ElevenLabsService, OpenAiTtsService],
  exports: [ElevenLabsService, OpenAiTtsService],
})
export class VoiceModule {}
