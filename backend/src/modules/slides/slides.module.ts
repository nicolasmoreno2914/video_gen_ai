import { Module } from '@nestjs/common';
import { SlidesService } from './slides.service';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [VideosModule],
  providers: [SlidesService],
  exports: [SlidesService],
})
export class SlidesModule {}
