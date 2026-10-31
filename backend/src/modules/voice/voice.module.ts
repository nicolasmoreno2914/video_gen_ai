import { Module } from '@nestjs/common';
import { OpenAiTtsService } from './openai-tts.service';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [VideosModule],
  providers: [OpenAiTtsService],
  exports: [OpenAiTtsService],
})
export class VoiceModule {}
