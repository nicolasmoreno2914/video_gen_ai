import { Queue } from 'bullmq';

export const VIDEO_QUEUE = 'video-processing';

/** Pausa automática de la cola (ver recovery.service.ts), guardada en Redis. */
export interface QueuePauseRecord {
  reason: string;
  since: string;
  resume_at: string;
  /** Pausas seguidas sin un video terminado entre medio: alarga la siguiente espera. */
  level: number;
}

const PAUSE_KEY = 'videogen:queue-pause';

/**
 * Solo el proceso worker monta videos. La API también carga QueueModule (para encolar) y antes
 * consumía la cola a la vez: dos procesos montando, y la API se reinicia al pasar de 1 GB.
 * En desarrollo local un solo proceso hace todo.
 */
export function processesJobs(): boolean {
  return process.env.VIDEOGEN_ROLE === 'worker' ||
    process.env.API_PROCESSES_JOBS === 'true' ||
    process.env.NODE_ENV !== 'production';
}

/** Encola un video. `tag` hace único el id del job de BullMQ (no admite repetidos). */
export async function enqueueVideo(queue: Queue, videoJobId: string, tag?: string, delayMs = 0): Promise<void> {
  await queue.add(
    'process-video',
    { jobId: videoJobId },
    {
      jobId: tag ? `${videoJobId}-${tag}` : videoJobId,
      attempts: 1,
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function readPauseRecord(queue: Queue): Promise<QueuePauseRecord | null> {
  const raw = await (await queue.client).get(PAUSE_KEY);
  return raw ? (JSON.parse(raw) as QueuePauseRecord) : null;
}

export async function writePauseRecord(queue: Queue, record: QueuePauseRecord | null): Promise<void> {
  const client = await queue.client;
  if (record) await client.set(PAUSE_KEY, JSON.stringify(record), 'EX', 7 * 24 * 3600);
  else await client.del(PAUSE_KEY);
}

/** Lo que ve el panel: si la cola está pausada, por qué y hasta cuándo. */
export async function getQueueStatus(queue: Queue): Promise<{
  paused: boolean;
  reason: string | null;
  since: string | null;
  resume_at: string | null;
  counts: Record<string, number>;
}> {
  const [paused, record, counts] = await Promise.all([
    queue.isPaused(),
    readPauseRecord(queue),
    queue.getJobCounts('active', 'waiting', 'delayed', 'paused'),
  ]);
  return {
    paused,
    reason: paused ? record?.reason ?? null : null,
    since: paused ? record?.since ?? null : null,
    resume_at: paused ? record?.resume_at ?? null : null,
    counts,
  };
}
