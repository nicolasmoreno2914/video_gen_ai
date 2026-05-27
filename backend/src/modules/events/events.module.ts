import { Module } from '@nestjs/common';
import { ProgressEventsService } from './progress.events';

@Module({
  providers: [ProgressEventsService],
  exports: [ProgressEventsService],
})
export class EventsModule {}
