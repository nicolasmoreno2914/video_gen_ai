import { Module } from '@nestjs/common';
import { OpenAiTtsService } from './openai-tts.service';
import { AudioAlignmentService } from './audio-alignment.service';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [VideosModule],
  providers: [OpenAiTtsService, AudioAlignmentService],
  exports: [OpenAiTtsService, AudioAlignmentService],
})
export class VoiceModule {}
