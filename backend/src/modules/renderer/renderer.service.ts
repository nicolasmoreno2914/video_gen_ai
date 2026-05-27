import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as FormData from 'form-data';
import axios from 'axios';
import { AppConfig } from '../../config/configuration';
import { VideoJob } from '../database/entities/video-job.entity';
import { VideoScene } from '../database/entities/video-scene.entity';
import { RenderResult } from '../../common/types';

interface SrtEntry {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

interface SttWord {
  text: string;
  start: number;
  end: number;
  type: 'word' | 'spacing';
}

@Injectable()
export class RendererService {
  private readonly logger = new Logger(RendererService.name);
  private readonly basePath: string;
  private readonly fps: number;
  private readonly elevenLabsApiKey: string;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const storage = this.configService.get<AppConfig['storage']>('storage')!;
    const video = this.configService.get<AppConfig['video']>('video')!;
    const elevenlabs = this.configService.get<AppConfig['elevenlabs']>('elevenlabs')!;
    this.basePath = storage.basePath;
    this.fps = video.fps;
    this.elevenLabsApiKey = elevenlabs.apiKey;
  }

  async render(job: VideoJob, scenes: VideoScene[]): Promise<RenderResult> {
    this.logger.log(`[RendererService] [${job.id}] Iniciando render de ${scenes.length} escenas`);

    const jobDir = path.join(this.basePath, 'jobs', job.id);
    const scenesDir = path.join(jobDir, 'scenes');
    const outputDir = path.join(jobDir, 'output');
    fs.mkdirSync(scenesDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    const sceneVideos: string[] = [];

    for (const scene of scenes) {
      const sceneVideoPath = await this.renderScene(job.id, scene, scenesDir);
      sceneVideos.push(sceneVideoPath);
      this.logger.log(`[RendererService] [${job.id}] Escena ${scene.scene_order}/${scenes.length} renderizada`);
    }

    const srtSceneVideos: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]!;
      const subtitledPath = path.join(scenesDir, `scene_${scene.scene_order}_sub.mp4`);
      await this.burnSceneSubtitles(scene, sceneVideos[i]!, subtitledPath, jobDir);
      srtSceneVideos.push(subtitledPath);
    }

    const outputPath = path.join(outputDir, 'final.mp4');
    await this.concatenateScenes(srtSceneVideos, outputPath);

    const durationSeconds = await this.getVideoDuration(outputPath);

    // Validate before delivering — throws if video is not playable
    await this.validateFinalVideo(outputPath, job.id);

    this.cleanupTempFiles(jobDir, sceneVideos, srtSceneVideos);

    this.logger.log(`[RendererService] [${job.id}] Video final: ${outputPath} (${durationSeconds.toFixed(1)}s)`);
    return { outputPath, durationSeconds };
  }

  async renderDryRun(job: VideoJob, scenes: VideoScene[]): Promise<RenderResult> {
    this.logger.log(`[RendererService] [${job.id}] Dry-run: renderizando ${scenes.length} escenas sin audio`);

    const jobDir = path.join(this.basePath, 'jobs', job.id);
    const scenesDir = path.join(jobDir, 'scenes');
    const outputDir = path.join(jobDir, 'output');
    fs.mkdirSync(scenesDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    const sceneVideos: string[] = [];

    for (const scene of scenes) {
      const sceneVideoPath = await this.renderSilentScene(job.id, scene, scenesDir);
      sceneVideos.push(sceneVideoPath);
      this.logger.log(`[RendererService] [${job.id}] Dry-run escena ${scene.scene_order}/${scenes.length} OK`);
    }

    const outputPath = path.join(outputDir, 'final.mp4');
    await this.concatenateSilentScenes(sceneVideos, outputPath);

    const durationSeconds = await this.getVideoDuration(outputPath);

    for (const f of sceneVideos) {
      try { fs.rmSync(f, { force: true }); } catch { /* non-critical */ }
    }

    this.logger.log(`[RendererService] [${job.id}] Dry-run video: ${outputPath} (${durationSeconds.toFixed(1)}s)`);
    return { outputPath, durationSeconds };
  }

  private renderSilentScene(jobId: string, scene: VideoScene, scenesDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const slidePath = scene.slide_png_url;
      const duration = scene.estimated_duration_seconds ?? 5;
      const outputPath = path.join(scenesDir, `scene_${scene.scene_order}_silent.mp4`);

      if (!slidePath || !fs.existsSync(slidePath)) {
        reject(new Error(`Slide no encontrado para escena ${scene.scene_order}: ${slidePath}`));
        return;
      }

      const fadeOut = Math.max(0, duration - 0.4);

      ffmpeg()
        .input(slidePath).inputOptions(['-loop 1'])
        .complexFilter([
          `[0:v]scale=1920:1080:flags=lanczos,` +
          `fade=t=in:st=0:d=0.3:color=white,` +
          `fade=t=out:st=${fadeOut.toFixed(3)}:d=0.3:color=white[v]`,
        ])
        .outputOptions([
          '-map [v]',
          '-c:v libx264', '-preset fast', '-crf 23', '-profile:v high', '-level 4.1',
          '-pix_fmt yuv420p',
          `-r ${this.fps}`,
          `-t ${duration.toFixed(3)}`,
          '-an',
        ])
        .output(outputPath)
        .on('error', (err: Error) => reject(err))
        .on('end', () => resolve(outputPath))
        .run();
    });
  }

  private concatenateSilentScenes(scenePaths: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const concatListPath = `${outputPath}.concat.txt`;
      fs.writeFileSync(concatListPath, scenePaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');

      ffmpeg()
        .input(concatListPath).inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c:v libx264', '-preset fast', '-crf 22', '-profile:v high', '-level 4.1',
          '-pix_fmt yuv420p',
          `-r ${this.fps}`,
          '-movflags +faststart',
          '-an',
        ])
        .output(outputPath)
        .on('error', (err: Error) => { fs.rmSync(concatListPath, { force: true }); reject(err); })
        .on('end', () => { fs.rmSync(concatListPath, { force: true }); resolve(); })
        .run();
    });
  }

  private renderScene(jobId: string, scene: VideoScene, scenesDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const slidePath = scene.slide_png_url;
      const audioPath = scene.audio_url;
      const duration = scene.duration_seconds ?? scene.estimated_duration_seconds ?? 30;
      const outputPath = path.join(scenesDir, `scene_${scene.scene_order}.mp4`);

      if (!slidePath || !fs.existsSync(slidePath)) {
        reject(new Error(`Slide no encontrado para escena ${scene.scene_order}: ${slidePath}`));
        return;
      }
      if (!audioPath || !fs.existsSync(audioPath)) {
        reject(new Error(`Audio no encontrado para escena ${scene.scene_order}: ${audioPath}`));
        return;
      }

      const fadeOut = Math.max(0, duration - 0.4);

      ffmpeg()
        .input(slidePath).inputOptions(['-loop 1'])
        .input(audioPath)
        .complexFilter([
          `[0:v]scale=1920:1080:flags=lanczos,` +
          `fade=t=in:st=0:d=0.4:color=white,` +
          `fade=t=out:st=${fadeOut.toFixed(3)}:d=0.4:color=white[v]`,
          `[1:a]aresample=44100,afade=t=in:st=0:d=0.2,afade=t=out:st=${Math.max(0, duration - 0.2).toFixed(3)}:d=0.2[a]`,
        ])
        .outputOptions([
          '-map [v]', '-map [a]',
          '-c:v libx264', '-preset fast', '-crf 23', '-profile:v high', '-level 4.1',
          '-c:a aac', '-b:a 128k', '-ar 44100', '-ac 2',
          '-pix_fmt yuv420p',
          `-r ${this.fps}`,
          `-t ${duration.toFixed(3)}`,
        ])
        .output(outputPath)
        .on('error', (err: Error) => {
          this.logger.error(`[RendererService] [${jobId}] Escena ${scene.scene_order} error: ${err.message}`);
          reject(err);
        })
        .on('end', () => resolve(outputPath))
        .run();
    });
  }

  // ─── STT: transcribir audio con ElevenLabs ───────────────────────────────

  private async transcribeAudio(audioPath: string): Promise<SttWord[] | null> {
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(audioPath), { filename: path.basename(audioPath), contentType: 'audio/mpeg' });
      form.append('model_id', 'scribe_v1');
      form.append('timestamps_granularity', 'word');

      const response = await axios.post<{ words: SttWord[] }>(
        'https://api.elevenlabs.io/v1/speech-to-text',
        form,
        {
          headers: { 'xi-api-key': this.elevenLabsApiKey, ...form.getHeaders() },
          timeout: 60000,
        },
      );

      return response.data.words?.filter(w => w.type === 'word') ?? null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[RendererService] STT falló (usando fallback): ${msg}`);
      return null;
    }
  }

  // ─── Agrupar palabras STT en bloques de subtítulo ────────────────────────

  private groupSttWordsIntoSrt(words: SttWord[], offset = 0.3): SrtEntry[] {
    const MAX_WORDS = 6;
    const PAUSE_THRESHOLD = 0.35;
    const PHRASE_ENDINGS = /[.,;:!?]$/;

    const entries: SrtEntry[] = [];
    let group: SttWord[] = [];
    let idx = 1;

    const flush = (): void => {
      if (group.length === 0) return;
      const text = group.map(w => w.text.trim()).join(' ').replace(/\s+/g, ' ').trim();
      if (!text) { group = []; return; }
      entries.push({
        index: idx++,
        startMs: Math.round((group[0]!.start + offset) * 1000),
        endMs: Math.round((group[group.length - 1]!.end + offset) * 1000),
        text,
      });
      group = [];
    };

    for (let i = 0; i < words.length; i++) {
      const word = words[i]!;
      group.push(word);

      const nextWord = words[i + 1];
      const pause = nextWord ? nextWord.start - word.end : Infinity;
      const isPhrasEnd = PHRASE_ENDINGS.test(word.text);
      const isFull = group.length >= MAX_WORDS;

      if (isFull || isPhrasEnd || pause >= PAUSE_THRESHOLD) {
        flush();
      }
    }
    flush();

    return entries;
  }

  // ─── Fallback mejorado: división por frases naturales ────────────────────

  private buildFallbackSrt(scene: VideoScene, offset = 0.3): SrtEntry[] {
    const duration = scene.duration_seconds ?? scene.estimated_duration_seconds ?? 30;
    const narration = scene.narration ?? '';
    const MAX_WORDS = 6;

    // Split on natural phrase boundaries before chunking
    const tokens = narration
      .replace(/([.,;:!?—])\s+/g, '$1\n')
      .split('\n')
      .flatMap(phrase => {
        const words = phrase.trim().split(/\s+/).filter(Boolean);
        const chunks: string[][] = [];
        for (let i = 0; i < words.length; i += MAX_WORDS) {
          chunks.push(words.slice(i, i + MAX_WORDS));
        }
        return chunks;
      })
      .filter(c => c.length > 0);

    const msPerChunk = (duration * 1000) / Math.max(tokens.length, 1);
    const entries: SrtEntry[] = [];

    tokens.forEach((chunk, i) => {
      const startMs = Math.round(i * msPerChunk + offset * 1000);
      const endMs = Math.min(Math.round((i + 1) * msPerChunk + offset * 1000), Math.round(duration * 1000));
      entries.push({ index: i + 1, startMs, endMs, text: chunk.join(' ') });
    });

    return entries;
  }

  // ─── Quemar subtítulos por escena (STT + fallback) ───────────────────────

  private async burnSceneSubtitles(
    scene: VideoScene,
    inputPath: string,
    outputPath: string,
    jobDir: string,
  ): Promise<string> {
    let entries: SrtEntry[];

    // Intentar STT real si hay audio
    if (scene.audio_url && fs.existsSync(scene.audio_url)) {
      this.logger.log(`[RendererService] Transcribiendo escena ${scene.scene_order} con STT`);
      const words = await this.transcribeAudio(scene.audio_url);
      if (words && words.length > 0) {
        entries = this.groupSttWordsIntoSrt(words);
        this.logger.log(`[RendererService] STT OK escena ${scene.scene_order}: ${entries.length} bloques`);
      } else {
        this.logger.warn(`[RendererService] STT vacío, usando fallback para escena ${scene.scene_order}`);
        entries = this.buildFallbackSrt(scene);
      }
    } else {
      entries = this.buildFallbackSrt(scene);
    }

    const srtContent = entries
      .map(e => `${e.index}\n${this.formatSrtTime(e.startMs)} --> ${this.formatSrtTime(e.endMs)}\n${e.text}\n`)
      .join('\n');

    const srtPath = path.join(jobDir, 'scenes', `scene_${scene.scene_order}_temp.srt`);
    fs.writeFileSync(srtPath, srtContent, 'utf8');

    return new Promise((resolve, reject) => {
      const escapedSrt = srtPath.replace(/:/g, '\\:').replace(/'/g, "\\'");

      ffmpeg(inputPath)
        .videoFilters(
          `subtitles='${escapedSrt}':force_style=` +
          `'FontName=Arial,FontSize=15,` +
          `PrimaryColour=&H00FFFFFF,` +
          `OutlineColour=&H66000000,` +
          `BackColour=&H40000000,` +
          `Outline=1,Shadow=0,Alignment=2,MarginV=30,Bold=0'`,
        )
        .outputOptions([
          '-c:v libx264', '-preset fast', '-crf 23', '-profile:v high', '-level 4.1',
          '-c:a aac', '-b:a 128k', '-ar 44100', '-ac 2',
          '-pix_fmt yuv420p',
          `-r ${this.fps}`,
        ])
        .output(outputPath)
        .on('error', (err: Error) => reject(err))
        .on('end', () => {
          fs.rmSync(srtPath, { force: true });
          resolve(outputPath);
        })
        .run();
    });
  }

  private concatenateScenes(scenePaths: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const concatListPath = `${outputPath}.concat.txt`;
      fs.writeFileSync(concatListPath, scenePaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');

      ffmpeg()
        .input(concatListPath).inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c:v libx264', '-preset fast', '-crf 22', '-profile:v high', '-level 4.1',
          '-c:a aac', '-b:a 128k', '-ar 44100', '-ac 2',
          '-pix_fmt yuv420p',
          `-r ${this.fps}`,
          '-movflags +faststart',
        ])
        .output(outputPath)
        .on('error', (err: Error) => { fs.rmSync(concatListPath, { force: true }); reject(err); })
        .on('end', () => { fs.rmSync(concatListPath, { force: true }); resolve(); })
        .run();
    });
  }

  private getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration ?? 0);
      });
    });
  }

  private validateFinalVideo(filePath: string, jobId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(new Error(`[render_validation] ffprobe falló: ${err.message}`));
          return;
        }

        const issues: string[] = [];

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        const duration = metadata.format.duration ?? 0;
        const size = metadata.format.size ?? 0;

        // Video codec
        if (!videoStream) {
          issues.push('no video stream encontrado');
        } else {
          if (videoStream.codec_name !== 'h264') {
            issues.push(`video codec es "${videoStream.codec_name}", se esperaba h264`);
          }
          if (videoStream.pix_fmt !== 'yuv420p') {
            issues.push(`pix_fmt es "${videoStream.pix_fmt}", se esperaba yuv420p`);
          }
          // Check frame rate
          const rFrameRate = videoStream.r_frame_rate ?? '';
          const [num, den] = rFrameRate.split('/').map(Number);
          const fps = den && den > 0 ? (num ?? 0) / den : 0;
          if (fps < 28 || fps > 32) {
            issues.push(`frame rate es ${fps.toFixed(2)} fps, se esperaba ~30`);
          }
        }

        // Audio codec
        if (!audioStream) {
          issues.push('no audio stream encontrado');
        } else {
          if (audioStream.codec_name !== 'aac') {
            issues.push(`audio codec es "${audioStream.codec_name}", se esperaba aac`);
          }
          const sr = Number(audioStream.sample_rate ?? 0);
          if (sr !== 44100 && sr !== 48000) {
            issues.push(`sample rate es ${sr}Hz, se esperaba 44100 o 48000`);
          }
        }

        // Duration
        if (duration < 10) {
          issues.push(`duración demasiado corta: ${duration.toFixed(1)}s`);
        }

        // File size sanity check (must be > 500KB)
        if (size < 500_000) {
          issues.push(`archivo demasiado pequeño: ${(size / 1024).toFixed(0)}KB`);
        }

        if (issues.length > 0) {
          const msg = `[render_validation] Video generado tiene problemas de compatibilidad: ${issues.join('; ')}`;
          this.logger.error(`[RendererService] [${jobId}] ${msg}`);
          reject(new Error(msg));
        } else {
          this.logger.log(
            `[RendererService] [${jobId}] Validación OK — h264/yuv420p/aac/44100Hz/${duration.toFixed(1)}s/${(size / 1024 / 1024).toFixed(1)}MB`,
          );
          resolve();
        }
      });
    });
  }

  private cleanupTempFiles(jobDir: string, sceneVideos: string[], srtSceneVideos: string[]): void {
    for (const f of [...sceneVideos, ...srtSceneVideos]) {
      try { fs.rmSync(f, { force: true }); } catch { /* non-critical */ }
    }
    for (const dir of [path.join(jobDir, 'slides'), path.join(jobDir, 'audio')]) {
      try {
        if (fs.existsSync(dir)) {
          for (const f of fs.readdirSync(dir)) {
            fs.rmSync(path.join(dir, f), { force: true });
          }
        }
      } catch { /* non-critical */ }
    }
  }

  private formatSrtTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const millis = ms % 1000;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }
}
