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
import {
  DEFAULT_OPENAI_TTS_MODEL,
  DEFAULT_OPENAI_TTS_VOICE,
  ttsModelSupportsInstructions,
} from './openai-tts.constants';
import { priceOpenAiTts } from '../costs/cost-config';

/** Marca del guion que se convierte en silencio real. */
export const PAUSE_MARKER = '[PAUSA]';
const PAUSE_SECONDS = 5;

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

@Injectable()
export class OpenAiTtsService {
  private readonly logger = new Logger(OpenAiTtsService.name);
  private readonly apiKey: string;
  private readonly basePath: string;
  private readonly defaultModel: string;
  private readonly instructions: string;
  private readonly limit = pLimit(3);

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly videosService: VideosService,
  ) {
    const cfg = this.configService.get<AppConfig['openai']>('openai')!;
    this.apiKey = cfg.apiKey;
    this.defaultModel = cfg.ttsModel || DEFAULT_OPENAI_TTS_MODEL;
    this.instructions = cfg.ttsInstructions;
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
    const model = opts.model ?? this.defaultModel;

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
    const model = opts.model ?? this.defaultModel;

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
    // [PAUSA] en el guion = silencio real (escenas de práctica: tiempo para pensar)
    const parts = (scene.narration ?? '').split(PAUSE_MARKER).map((p) => p.trim()).filter(Boolean);
    const text = parts.join(' ');
    const instructions = ttsModelSupportsInstructions(model) ? this.instructions : '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const buffers: Buffer[] = [];
        for (const part of parts.length ? parts : ['']) {
          const response = await axios.post<Buffer>(
            'https://api.openai.com/v1/audio/speech',
            {
              model,
              input: part,
              voice,
              response_format: 'mp3',
              ...(instructions ? { instructions } : {}),
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
          buffers.push(Buffer.from(response.data));
        }

        // El TTS a veces deja silencios internos de ~2 s que suenan a corte: se limitan a 0,6 s
        // (en cada fragmento, antes de añadir la pausa de práctica)
        if (buffers.length === 1) {
          fs.writeFileSync(outputPath, buffers[0]);
          await this.capInternalSilences(outputPath);
        } else await this.joinWithSilence(buffers, outputPath, PAUSE_SECONDS);

        const durationSeconds = await this.getAudioDuration(outputPath);

        await this.videosService.updateScene(scene.id, {
          audio_url: outputPath,
          duration_seconds: durationSeconds,
        });

        // Las instrucciones también se cobran como tokens de texto de entrada
        const price = priceOpenAiTts(model, text.length + instructions.length, durationSeconds);
        await this.videosService.logApiUsage({
          videoJobId: job.id,
          institutionId: job.institution_id,
          provider: 'openai_tts',
          operation: 'tts',
          inputUnits: text.length,
          estimatedCost: price.cost,
          modelName: model,
          unitType: 'characters',
          metadata: {
            characters: text.length,
            voice,
            model,
            scene_order: scene.scene_order,
            duration_seconds: durationSeconds,
            instructions_characters: instructions.length,
            pricing: price.pricing,
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

    return DEFAULT_OPENAI_TTS_VOICE;
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

  /** Limita los silencios internos a 0,6 s. */
  private async capInternalSilences(file: string): Promise<void> {
    const tmp = `${file}.trim.mp3`;
    await new Promise<void>((resolve) => {
      childProcess.execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-af',
        'silenceremove=stop_periods=-1:stop_duration=1.0:stop_threshold=-55dB:stop_silence=0.7', '-b:a', '128k', tmp],
      (err) => {
        if (!err && fs.existsSync(tmp)) fs.renameSync(tmp, file);
        resolve(); // si falla, se conserva el audio original
      });
    });
  }

  /** Une segmentos de voz con un silencio real entre ellos. */
  private async joinWithSilence(buffers: Buffer[], outputPath: string, silence: number): Promise<void> {
    const tmp = buffers.map((b, i) => {
      const f = `${outputPath}.part${i}.mp3`;
      fs.writeFileSync(f, b);
      return f;
    });
    for (const f of tmp) await this.capInternalSilences(f);
    const inputs = tmp.flatMap((f) => ['-i', f]);
    const n = tmp.length;
    const silences = Array.from({ length: n - 1 }, (_, i) => `aevalsrc=0:d=${silence}:s=24000[s${i}]`);
    const chain = tmp.map((_, i) => `[${i}:a]aresample=24000,aformat=channel_layouts=mono[a${i}]`);
    const order = tmp.map((_, i) => (i < n - 1 ? `[a${i}][s${i}]` : `[a${i}]`)).join('');
    const filter = [...chain, ...silences, `${order}concat=n=${2 * n - 1}:v=0:a=1[out]`].join(';');
    await new Promise<void>((resolve, reject) => {
      childProcess.execFile('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-b:a', '128k', outputPath],
        (err) => (err ? reject(err) : resolve()));
    });
    tmp.forEach((f) => fs.rmSync(f, { force: true }));
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
