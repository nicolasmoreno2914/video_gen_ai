import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DualAuthGuard } from '../../common/guards/dual-auth.guard';
import { VIDEO_QUEUE, getQueueStatus } from '../queue/queue.constants';

/** Estado de la cola para el panel: si está pausada por un problema general, y reanudarla. */
@Controller('queue')
@UseGuards(DualAuthGuard)
export class QueueStatusController {
  constructor(@InjectQueue(VIDEO_QUEUE) private readonly videoQueue: Queue) {}

  @Get('status')
  status(): ReturnType<typeof getQueueStatus> {
    return getQueueStatus(this.videoQueue);
  }

  /** Reanudar ya (p. ej. tras recargar crédito). Si el problema sigue, la cola se vuelve a pausar sola. */
  @Post('resume')
  @HttpCode(HttpStatus.OK)
  async resume(): Promise<{ success: boolean }> {
    await this.videoQueue.resume();
    return { success: true };
  }
}
