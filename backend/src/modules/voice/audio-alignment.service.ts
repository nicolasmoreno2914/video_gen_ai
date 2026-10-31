import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';
import pLimit from 'p-limit';
import { AppConfig } from '../../config/configuration';
import { VideoJob } from '../database/entities/video-job.entity';
import { VideoScene } from '../database/entities/video-scene.entity';
import { VideosService } from '../videos/videos.service';
import { priceStt } from '../costs/cost-config';

const STT_MODEL = 'whisper-1';

/**
 * Obtiene los tiempos por palabra de la narración de cada escena (Whisper) y los guarda
 * en video_scenes.word_timings. Se ejecuta antes de los slides para sincronizar las
 * animaciones con la voz; el renderer reutiliza los mismos tiempos para los subtítulos,
 * así Whisper se paga una sola vez por escena.
 */
@Injectable()
export class AudioAlignmentService {
  private readonly logger = new Logger(AudioAlignmentService.name);
  private readonly client: OpenAI;
  private readonly limit = pLimit(4);

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly videosService: VideosService,
  ) {
    const cfg = this.configService.get<AppConfig['openai']>('openai')!;
    this.client = new OpenAI({ apiKey: cfg.apiKey });
  }

  /** Alinea las escenas que tienen audio y aún no tienen word_timings. Nunca lanza: sin tiempos, se anima con reparto uniforme. */
  async alignScenes(job: VideoJob, scenes: VideoScene[]): Promise<void> {
    const pending = scenes.filter(
      (s) => !s.word_timings?.length && s.audio_url && fs.existsSync(s.audio_url),
    );
    if (pending.length === 0) return;

    this.logger.log(`[AudioAlignment] [${job.id}] Alineando ${pending.length} escenas con ${STT_MODEL}`);

    let billedSeconds = 0;
    let calls = 0;
    await Promise.all(
      pending.map((scene) =>
        this.limit(async () => {
          const result = await this.transcribe(scene.audio_url!);
          if (!result) return;
          billedSeconds += result.billedSeconds || (scene.duration_seconds ?? 0);
          calls += 1;
          scene.word_timings = result.words;
          await this.videosService.updateScene(scene.id, { word_timings: result.words });
        }),
      ),
    );

    if (calls > 0) {
      const price = priceStt(STT_MODEL, billedSeconds);
      await this.videosService.logApiUsage({
        videoJobId: job.id,
        institutionId: job.institution_id,
        provider: 'openai_stt',
        operation: 'audio_alignment',
        inputUnits: Math.round(billedSeconds),
        estimatedCost: price.cost,
        modelName: STT_MODEL,
        unitType: 'seconds',
        metadata: { audio_seconds: billedSeconds, calls, pricing: price.pricing },
      });
    }

    this.logger.log(`[AudioAlignment] [${job.id}] ${calls}/${pending.length} escenas alineadas`);
  }

  private async transcribe(
    audioPath: string,
  ): Promise<{ words: Array<{ text: string; start: number; end: number }>; billedSeconds: number } | null> {
    try {
      const response = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(audioPath) as unknown as File,
        model: STT_MODEL,
        language: 'es',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
      });
      const verbose = response as unknown as {
        duration?: number;
        words?: Array<{ word: string; start: number; end: number }>;
      };
      return {
        billedSeconds: Number(verbose.duration) || 0,
        words: (verbose.words ?? []).map((w) => ({ text: w.word, start: w.start, end: w.end })),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[AudioAlignment] Whisper falló para ${audioPath}: ${msg}`);
      return null;
    }
  }
}
