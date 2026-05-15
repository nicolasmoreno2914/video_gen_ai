import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TempFile } from './entities/temp-file.entity';
import { TempStorageService } from './temp-storage.service';
import { TempStorageController } from './temp-storage.controller';
import { TempStorageCleanupService } from './temp-storage-cleanup.service';

@Module({
  imports: [TypeOrmModule.forFeature([TempFile])],
  controllers: [TempStorageController],
  providers: [TempStorageService, TempStorageCleanupService],
  exports: [TempStorageService],
})
export class TempStorageModule {}
