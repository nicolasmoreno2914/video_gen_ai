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
import { Institution } from '../database/entities/institution.entity';
import { VideosService } from '../videos/videos.service';

interface ElevenLabsUser {
  subscription: {
    character_count: number;
    character_limit: number;
    next_character_count_reset_unix: number;
  };
}

// Errors that should not be retried
const FATAL_STATUS_CODES = new Set([401, 403, 422]);

@Injectable()
export class ElevenLabsService {
  private readonly logger = new Logger(ElevenLabsService.name);
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly defaultVoiceId: string;
  private readonly basePath: string;
  private readonly limit = pLimit(3);

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly videosService: VideosService,
  ) {
    const cfg = this.configService.get<AppConfig['elevenlabs']>('elevenlabs')!;
    this.apiKey = cfg.apiKey;
    this.modelId = cfg.modelId;
    this.defaultVoiceId = cfg.defaultVoiceId;
    this.basePath = this.configService.get<AppConfig['storage']>('storage')?.basePath ?? '/tmp/video-engine';
  }

  async generateAllAudio(
    job: VideoJob,
    scenes: VideoScene[],
    institution: Institution | null,
  ): Promise<void> {
    this.logger.log(`[ElevenLabsService] [${job.id}] Generando audio para ${scenes.length} escenas`);

    const voiceId = this.resolveVoiceId(job, institution);

    // Pre-flight: validate key + check quota before spending any resources
    await this.preflight(job.id, scenes, voiceId);

    const audioDir = path.join(this.basePath, 'jobs', job.id, 'audio');
    fs.mkdirSync(audioDir, { recursive: true });

    await Promise.all(
      scenes.map((scene) =>
        this.limit(() => this.generateSceneAudio(job, scene, voiceId, audioDir)),
      ),
    );

    this.logger.log(`[ElevenLabsService] [${job.id}] Audio generado para todas las escenas`);
  }

  async regenerateScenesAudio(
    job: VideoJob,
    scenes: VideoScene[],
    institution: Institution | null,
  ): Promise<void> {
    if (scenes.length === 0) return;
    this.logger.log(`[ElevenLabsService] [${job.id}] Regenerando audio para ${scenes.length} escenas`);

    const voiceId = this.resolveVoiceId(job, institution);
    const audioDir = path.join(this.basePath, 'jobs', job.id, 'audio');
    fs.mkdirSync(audioDir, { recursive: true });

    await Promise.all(
      scenes.map((scene) =>
        this.limit(() => this.generateSceneAudio(job, scene, voiceId, audioDir)),
      ),
    );

    this.logger.log(`[ElevenLabsService] [${job.id}] Regeneración completada para ${scenes.length} escenas`);
  }

  // ─── Pre-flight: API key + quota ─────────────────────────────────────────

  private async preflight(jobId: string, scenes: VideoScene[], voiceId: string): Promise<void> {
    const totalChars = scenes.reduce((sum, s) => sum + (s.narration?.length ?? 0), 0);

    let user: ElevenLabsUser | null = null;
    try {
      const res = await axios.get<ElevenLabsUser>('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': this.apiKey },
        timeout: 15000,
      });
      user = res.data;
    } catch (err: unknown) {
      const detail = this.parseElevenLabsError(err);
      // 401 here means the key lacks "user_read" permission — that's OK, TTS may still work
      // We warn and skip quota check rather than blocking the job
      this.logger.warn(
        `[ElevenLabsService] [${jobId}] Pre-flight /user no disponible (la key puede carecer de permiso user_read). ` +
        `Continuando — el TTS validará la key al generar. ${detail}`,
      );
      // Skip the rest of preflight; the TTS call will fail fast if the key is truly invalid
      return;
    }

    const { character_count, character_limit, next_character_count_reset_unix } = user.subscription;
    const remaining = character_limit - character_count;
    const resetDate = new Date(next_character_count_reset_unix * 1000).toLocaleDateString('es-ES');

    this.logger.log(
      `[ElevenLabsService] [${jobId}] Cuota: ${character_count.toLocaleString()} / ${character_limit.toLocaleString()} chars usados. ` +
      `Disponibles: ${remaining.toLocaleString()}. Reset: ${resetDate}. ` +
      `Este video necesita ~${totalChars.toLocaleString()} chars.`,
    );

    // Verify voice exists
    try {
      await axios.get(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
        headers: { 'xi-api-key': this.apiKey },
        timeout: 10000,
      });
      this.logger.log(`[ElevenLabsService] [${jobId}] Voice ID ${voiceId} verificada ✓`);
    } catch (err: unknown) {
      const detail = this.parseElevenLabsError(err);
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        throw new Error(
          `ElevenLabs: Voice ID "${voiceId}" no encontrada. ` +
          `Verifica el ID en tu biblioteca de voces en elevenlabs.io. ${detail}`,
        );
      }
      this.logger.warn(`[ElevenLabsService] [${jobId}] No se pudo verificar voice ID: ${detail}`);
    }

    if (remaining < totalChars) {
      throw new Error(
        `ElevenLabs: cuota insuficiente. ` +
        `El video necesita ~${totalChars.toLocaleString()} caracteres pero solo quedan ` +
        `${remaining.toLocaleString()} disponibles (límite: ${character_limit.toLocaleString()}). ` +
        `La cuota se renueva el ${resetDate}. ` +
        `Aumenta el límite en elevenlabs.io/settings/api-keys o espera al reset.`,
      );
    }
  }

  // ─── TTS por escena ───────────────────────────────────────────────────────

  private async generateSceneAudio(
    job: VideoJob,
    scene: VideoScene,
    voiceId: string,
    audioDir: string,
  ): Promise<void> {
    const outputPath = path.join(audioDir, `scene_${scene.scene_order}.mp3`);
    const text = scene.narration ?? '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await axios.post<Buffer>(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            text,
            model_id: this.modelId,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.2,
              use_speaker_boost: true,
            },
          },
          {
            headers: {
              'xi-api-key': this.apiKey,
              Accept: 'audio/mpeg',
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
          provider: 'elevenlabs',
          operation: 'tts',
          inputUnits: text.length,
          estimatedCost: text.length * 0.00003,
          modelName: this.modelId,
          unitType: 'characters',
          metadata: { characters: text.length, voice_id: voiceId, scene_order: scene.scene_order, duration_seconds: durationSeconds },
        });

        this.logger.log(
          `[ElevenLabsService] [${job.id}] Escena ${scene.scene_order}: ${durationSeconds.toFixed(1)}s de audio`,
        );
        return;
      } catch (err: unknown) {
        const detail = this.parseElevenLabsError(err);
        const status = axios.isAxiosError(err) ? err.response?.status : null;

        // Don't retry auth/permission/validation errors
        if (status && FATAL_STATUS_CODES.has(status)) {
          throw new Error(
            `ElevenLabs error ${status} en escena ${scene.scene_order} (no reintentable): ${detail}`,
          );
        }

        // Quota exhausted mid-generation
        if (status === 402) {
          throw new Error(
            `ElevenLabs: cuota agotada durante la generación (escena ${scene.scene_order}). ` +
            `${detail}. Aumenta el límite mensual en elevenlabs.io/settings/api-keys.`,
          );
        }

        this.logger.warn(
          `[ElevenLabsService] [${job.id}] Escena ${scene.scene_order} intento ${attempt}/3 [HTTP ${status ?? 'err'}]: ${detail}`,
        );
        if (attempt < 3) await this.sleep(3000 * attempt);
      }
    }

    throw new Error(
      `No se pudo generar audio para escena ${scene.scene_order} después de 3 intentos`,
    );
  }

  // ─── Parsear errores de ElevenLabs ───────────────────────────────────────

  private parseElevenLabsError(err: unknown): string {
    if (!axios.isAxiosError(err)) {
      return err instanceof Error ? err.message : String(err);
    }

    const axiosErr = err as AxiosError;
    const status = axiosErr.response?.status ?? 0;
    const data = axiosErr.response?.data;

    if (!data) return axiosErr.message;

    try {
      // data may be Buffer (arraybuffer) or object
      const text = Buffer.isBuffer(data)
        ? data.toString('utf8')
        : typeof data === 'string'
          ? data
          : JSON.stringify(data);

      const json = JSON.parse(text) as Record<string, unknown>;

      // ElevenLabs error format: { detail: { message, status } } or { detail: "string" }
      if (json.detail) {
        if (typeof json.detail === 'string') return `[${status}] ${json.detail}`;
        const d = json.detail as Record<string, unknown>;
        return `[${status}] ${d.message ?? d.status ?? text}`;
      }
      if (json.message) return `[${status}] ${json.message}`;
      return `[${status}] ${text.substring(0, 300)}`;
    } catch {
      return `[${status}] ${axiosErr.message}`;
    }
  }

  private resolveVoiceId(job: VideoJob, institution: Institution | null): string {
    if (job.brand_voice_id) return job.brand_voice_id;
    if (institution?.elevenlabs_voice_id) return institution.elevenlabs_voice_id;
    if (this.defaultVoiceId) return this.defaultVoiceId;
    throw new Error(
      'No hay voice_id configurado. Proporciona brand.voice_id, ' +
      'institution.elevenlabs_voice_id o ELEVENLABS_DEFAULT_VOICE_ID en .env',
    );
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
            const data = JSON.parse(stdout) as { format?: { duration?: string } };
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
