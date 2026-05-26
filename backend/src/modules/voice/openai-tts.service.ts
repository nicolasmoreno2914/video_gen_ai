import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import pLimit from 'p-limit';
import { AppConfig } from '../../config/configuration';
import { VideoJob } from '../database/entities/video-job.entity';
import { VideoScene } from '../database/entities/video-scene.entity';
import { VideosService } from '../videos/videos.service';

export interface OpenAiTtsOpts {
  voice?: string;
  model?: string;
}

// Voices supported by gpt-4o-mini-tts and tts-1/tts-1-hd
const VALID_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo',
  'fable', 'nova', 'onyx', 'sage', 'shimmer',
  'verse', 'marin', 'cedar',
]);

const DEFAULT_VOICE = 'marin';
const DEFAULT_MODEL = 'gpt-4o-mini-tts';

// Cost estimate: gpt-4o-mini-tts ≈ $0.60 per 1M chars = $0.0000006/char
const COST_PER_CHAR = 0.0000006;

@Injectable()
export class OpenAiTtsService {
  private readonly logger = new Logger(OpenAiTtsService.name);
  private readonly apiKey: string;
  private readonly basePath: string;
  private readonly limit = pLimit(3);

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly videosService: VideosService,
  ) {
    const cfg = this.configService.get<AppConfig['openai']>('openai')!;
    this.apiKey = cfg.apiKey;
    this.basePath =
      this.configService.get<AppConfig['storage']>('storage')?.basePath ??
      '/tmp/video-engine';
  }

  async generateAllAudio(
    job: VideoJob,
    scenes: VideoScene[],
    opts: OpenAiTtsOpts = {},
  ): Promise<void> {
    const voice = this.resolveVoice(job, opts.voice);
    const model = opts.model ?? DEFAULT_MODEL;

    this.logger.log(
      `[OpenAiTtsService] [${job.id}] Generando audio para ${scenes.length} escenas ` +
      `(voice=${voice}, model=${model})`,
    );

    if (!this.apiKey) {
      throw new Error(
        'OpenAI TTS: OPENAI_API_KEY no configurada en el servidor. ' +
        'Agrega la variable de entorno y reinicia el servicio.',
      );
    }

    const audioDir = path.join(this.basePath, 'jobs', job.id, 'audio');
    fs.mkdirSync(audioDir, { recursive: true });

    await Promise.all(
      scenes.map((scene) =>
        this.limit(() =>
          this.generateSceneAudio(job, scene, voice, model, audioDir),
        ),
      ),
    );

    this.logger.log(
      `[OpenAiTtsService] [${job.id}] Audio generado para todas las escenas ✓`,
    );
  }

  async regenerateScenesAudio(
    job: VideoJob,
    scenes: VideoScene[],
    opts: OpenAiTtsOpts = {},
  ): Promise<void> {
    if (scenes.length === 0) return;

    const voice = this.resolveVoice(job, opts.voice);
    const model = opts.model ?? DEFAULT_MODEL;

    this.logger.log(
      `[OpenAiTtsService] [${job.id}] Regenerando audio para ${scenes.length} escenas ` +
      `(voice=${voice}, model=${model})`,
    );

    const audioDir = path.join(this.basePath, 'jobs', job.id, 'audio');
    fs.mkdirSync(audioDir, { recursive: true });

    await Promise.all(
      scenes.map((scene) =>
        this.limit(() =>
          this.generateSceneAudio(job, scene, voice, model, audioDir),
        ),
      ),
    );
  }

  private async generateSceneAudio(
    job: VideoJob,
    scene: VideoScene,
    voice: string,
    model: string,
    audioDir: string,
  ): Promise<void> {
    const outputPath = path.join(audioDir, `scene_${scene.scene_order}.mp3`);
    const text = scene.narration ?? '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await axios.post<Buffer>(
          'https://api.openai.com/v1/audio/speech',
          {
            model,
            input: text,
            voice,
            response_format: 'mp3',
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer',
            timeout: 60000,
          },
        );

        fs.writeFileSync(outputPath, Buffer.from(response.data));

        const durationSeconds = await this.getAudioDuration(outputPath);

        await this.videosService.updateScene(scene.id, {
          audio_url: outputPath,
          duration_seconds: durationSeconds,
        });

        await this.videosService.logApiUsage({
          videoJobId: job.id,
          institutionId: job.institution_id,
          provider: 'openai_tts',
          operation: 'tts',
          inputUnits: text.length,
          estimatedCost: text.length * COST_PER_CHAR,
          modelName: model,
          unitType: 'characters',
          metadata: {
            characters: text.length,
            voice,
            model,
            scene_order: scene.scene_order,
            duration_seconds: durationSeconds,
          },
        });

        this.logger.log(
          `[OpenAiTtsService] [${job.id}] Escena ${scene.scene_order}: ` +
          `${durationSeconds.toFixed(1)}s de audio (OpenAI/${voice})`,
        );
        return;
      } catch (err: unknown) {
        const status = axios.isAxiosError(err) ? (err as AxiosError).response?.status : null;
        const detail = this.parseError(err);

        if (status === 401) {
          throw new Error(
            `OpenAI TTS: API key inválida o expirada. ${detail}`,
          );
        }
        if (status === 429) {
          throw new Error(
            `OpenAI TTS: rate limit / cuota agotada en escena ${scene.scene_order}. ` +
            `${detail}. Revisa tu cuenta en platform.openai.com/usage.`,
          );
        }
        if (status && [400, 403].includes(status)) {
          throw new Error(
            `OpenAI TTS error ${status} en escena ${scene.scene_order} (no reintentable): ${detail}`,
          );
        }

        this.logger.warn(
          `[OpenAiTtsService] [${job.id}] Escena ${scene.scene_order} ` +
          `intento ${attempt}/3 [HTTP ${status ?? 'err'}]: ${detail}`,
        );
        if (attempt < 3) await this.sleep(3000 * attempt);
      }
    }

    throw new Error(
      `OpenAI TTS: no se pudo generar audio para escena ${scene.scene_order} después de 3 intentos`,
    );
  }

  private resolveVoice(job: VideoJob, override?: string): string {
    if (override && VALID_VOICES.has(override)) return override;

    // Check external_metadata for voice preference
    const meta = job.external_metadata as Record<string, string> | null;
    const metaVoice = meta?.tts_voice ?? meta?.voice;
    if (metaVoice && VALID_VOICES.has(metaVoice)) return metaVoice;

    return DEFAULT_VOICE;
  }

  private parseError(err: unknown): string {
    if (!axios.isAxiosError(err)) {
      return err instanceof Error ? err.message : String(err);
    }

    const axiosErr = err as AxiosError;
    const status = axiosErr.response?.status ?? 0;
    const data = axiosErr.response?.data;

    if (!data) return axiosErr.message;

    try {
      const text = Buffer.isBuffer(data)
        ? data.toString('utf8')
        : typeof data === 'string'
          ? data
          : JSON.stringify(data);

      const json = JSON.parse(text) as Record<string, unknown>;
      const errObj = json.error as Record<string, unknown> | undefined;
      if (errObj?.message) return `[${status}] ${String(errObj.message)}`;
      return `[${status}] ${text.substring(0, 300)}`;
    } catch {
      return `[${status}] ${axiosErr.message}`;
    }
  }

  private getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      childProcess.execFile(
        'ffprobe',
        ['-v', 'quiet', '-print_format', 'json', '-show_format', filePath],
        (err, stdout) => {
          if (err) {
            try {
              const stats = fs.statSync(filePath);
              resolve(stats.size / 16000);
            } catch {
              resolve(30);
            }
            return;
          }
          try {
            const data = JSON.parse(stdout) as {
              format?: { duration?: string };
            };
            resolve(parseFloat(data.format?.duration ?? '30'));
          } catch {
            resolve(30);
          }
        },
      );
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
