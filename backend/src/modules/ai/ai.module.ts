import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [VideosModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
