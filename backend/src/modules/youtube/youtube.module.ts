import { Module } from '@nestjs/common';
import { YouTubeService } from './youtube.service';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [VideosModule],
  providers: [YouTubeService],
  exports: [YouTubeService],
})
export class YouTubeModule {}
