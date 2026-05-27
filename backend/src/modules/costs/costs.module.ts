import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { VideoJob } from '../database/entities/video-job.entity';
import { CostsService } from './costs.service';
import { CostsController } from './costs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ApiUsageLog, VideoJob])],
  controllers: [CostsController],
  providers: [CostsService],
  exports: [CostsService],
})
export class CostsModule {}
