import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CursiaBatch } from './entities/cursia-batch.entity';
import { CursiaItem } from './entities/cursia-item.entity';
import { CursiaBatchesController } from './cursia-batches.controller';
import { CursiaBatchesService } from './services/cursia-batches.service';
import { CursiaCallbackService } from './services/cursia-callback.service';
import { TempStorageModule } from '../temp-storage/temp-storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CursiaBatch, CursiaItem]),
    TempStorageModule,
  ],
  controllers: [CursiaBatchesController],
  providers: [CursiaBatchesService, CursiaCallbackService],
  exports: [CursiaBatchesService],
})
export class CursiaModule {}
