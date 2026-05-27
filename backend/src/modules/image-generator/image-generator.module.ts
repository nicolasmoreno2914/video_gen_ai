import { Module } from '@nestjs/common';
import { DalleService } from './dalle.service';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [VideosModule],
  providers: [DalleService],
  exports: [DalleService],
})
export class ImageGeneratorModule {}
