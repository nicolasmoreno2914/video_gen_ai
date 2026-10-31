import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import pLimit from 'p-limit';
import { buildVfrEntries, readFramesList, writeFramesList } from './vfr-frames';
import { AppConfig } from '../../config/configuration';
import { VideoJob } from '../database/entities/video-job.entity';
import { VideoScene } from '../database/entities/video-scene.entity';
import { RenderResult } from '../../common/types';
import { SlidesService } from '../slides/slides.service';
import { buildSubtitleCues } from './subtitles';

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

// Pausa al final de cada escena: corta dentro de un mismo bloque, más larga al cambiar de bloque
const PAUSE_SAME_BLOCK = 0.5;
const PAUSE_NEW_BLOCK = 0.9;
const PAUSE_END = 1.5;
const BLOCKS: Record<string, string> = {
  hook: 'intro', context: 'intro', explanation: 'core', process: 'core', comparison: 'core',
  application: 'apply', example: 'apply', practice: 'apply', summary: 'close', conclusion: 'close',
};
const PROGRESS_BAR_HEIGHT = 6;
// La barra avanza ~4 px/s en un video de 7 min: basta un fotograma cada medio segundo
const PROGRESS_BAR_STEP = 0.5;
const SCENE_FADE = 0.35;
const VFR_TIMESCALE = 30000;

@Injectable()
export class RendererService {
  private readonly logger = new Logger(RendererService.name);
  private readonly basePath: string;
  private readonly fps: number;
  private readonly openai: OpenAI;
  // pLimit(3): paralleliza escenas sin saturar CPU del VPS
  private readonly renderLimit = pLimit(3);
  private readonly sttLimit = pLimit(4);
  private readonly sttModel = 'whisper-1';
  private readonly subtitlesMode: 'burned' | 'sidecar';
  private readonly preset: string;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const storage = this.configService.get<AppConfig['storage']>('storage')!;
    const video = this.configService.get<AppConfig['video']>('video')!;
    const openaiCfg = this.configService.get<AppConfig['openai']>('openai')!;
    this.basePath = storage.basePath;
    this.fps = video.fps;
    this.subtitlesMode = video.subtitlesMode ?? 'burned';
    this.preset = video.renderPreset || 'ultrafast';
    this.openai = new OpenAI({ apiKey: openaiCfg.apiKey });
  }

  async render(job: VideoJob, scenes: VideoScene[]): Promise<RenderResult> {
    this.logger.log(`[RendererService] [${job.id}] Iniciando render de ${scenes.length} escenas`);

    const jobDir = path.join(this.basePath, 'jobs', job.id);
    const scenesDir = path.join(jobDir, 'scenes');
    const outputDir = path.join(jobDir, 'output');
    fs.mkdirSync(scenesDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    // Línea de tiempo global (cada escena + pausa) para la barra de progreso y el VTT
    const starts: number[] = [];
    const pauses: number[] = [];
    let total = 0;
    scenes.forEach((scene, i) => {
      const next = scenes[i + 1];
      // Al final del video, 1,5 s para que la pregunta de cierre no quede cortada
      const pause = !next ? PAUSE_END
        : BLOCKS[next.scene_type ?? ''] !== BLOCKS[scene.scene_type ?? ''] ? PAUSE_NEW_BLOCK : PAUSE_SAME_BLOCK;
      starts.push(total);
      pauses.push(pause);
      total += (scene.duration_seconds ?? scene.estimated_duration_seconds ?? 30) + pause;
    });
    const brand = { primary: job.brand_primary_color || '#003366', secondary: job.brand_secondary_color || '#00AEEF' };

    // Una sola codificación por escena: slide (animado o fijo) + voz + subtítulos + barra de progreso
    const stt = { model: this.sttModel, audioSeconds: 0, calls: 0 };
    const sceneSubs: SrtEntry[][] = new Array(scenes.length);
    const sceneVideos = await Promise.all(
      scenes.map((scene, i) =>
        this.renderLimit(async () => {
          const { srtPath, entries } = await this.writeSceneSubtitles(scene, jobDir, stt);
          sceneSubs[i] = entries;
          const sceneVideoPath = await this.renderScene(job.id, scene, scenesDir, {
            srtPath, entries, start: starts[i], total, brand, pause: pauses[i],
          });
          this.logger.log(`[RendererService] [${job.id}] Escena ${scene.scene_order}/${scenes.length} renderizada`);
          return sceneVideoPath;
        }),
      ),
    );

    const outputPath = path.join(outputDir, 'final.mp4');
    await this.concatenateScenes(sceneVideos, outputPath);

    const durationSeconds = await this.getVideoDuration(outputPath);

    // Validate before delivering — throws if video is not playable
    await this.validateFinalVideo(outputPath, job.id);

    this.cleanupTempFiles(jobDir, sceneVideos, []);

    const subtitlesPath = path.join(outputDir, 'subtitles.vtt');
    fs.writeFileSync(subtitlesPath, this.buildVtt(sceneSubs, starts), 'utf8');

    this.logger.log(`[RendererService] [${job.id}] Video final: ${outputPath} (${durationSeconds.toFixed(1)}s)`);
    return { outputPath, durationSeconds, stt, subtitlesPath };
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
          '-c:v libx264', '-preset ultrafast', '-crf 23', '-profile:v high', '-level 4.1',
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
          '-c:v libx264', '-preset ultrafast', '-crf 22', '-profile:v high', '-level 4.1',
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

  private renderScene(
    jobId: string,
    scene: VideoScene,
    scenesDir: string,
    opts: {
      srtPath: string;
      entries: SrtEntry[];
      start: number;
      total: number;
      pause: number;
      brand: { primary: string; secondary: string };
    },
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const slidePath = scene.slide_png_url;
      const audioPath = scene.audio_url;
      const speech = scene.duration_seconds ?? scene.estimated_duration_seconds ?? 30;
      // Pausa breve al final de cada escena: el estudiante respira entre ideas
      const duration = speech + opts.pause;
      const outputPath = path.join(scenesDir, `scene_${scene.scene_order}.mp4`);

      if (!slidePath || !fs.existsSync(slidePath)) {
        reject(new Error(`Slide no encontrado para escena ${scene.scene_order}: ${slidePath}`));
        return;
      }
      if (!audioPath || !fs.existsSync(audioPath)) {
        reject(new Error(`Audio no encontrado para escena ${scene.scene_order}: ${audioPath}`));
        return;
      }

      const fadeOut = Math.max(0, duration - SCENE_FADE);
      const framesList = SlidesService.framesListPath(slidePath, scene.scene_order);
      const animated = fs.existsSync(framesList);
      // Un fotograma solo cuando algo cambia (ver vfr-frames.ts); el slide fijo es una sola imagen
      const vfrList = path.join(scenesDir, `scene_${scene.scene_order}_frames.txt`);
      const overlayCuts = this.subtitlesMode === 'burned'
        ? opts.entries.flatMap((e) => [e.startMs / 1000, e.endMs / 1000])
        : [];
      writeFramesList(
        buildVfrEntries(animated ? readFramesList(framesList) : [{ file: slidePath, hold: duration }], {
          duration, cuts: overlayCuts, fps: this.fps, fade: SCENE_FADE, maxHold: PROGRESS_BAR_STEP,
        }),
        vfrList,
      );
      const escapedSrt = opts.srtPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
      const bar = opts.brand.secondary.replace('#', '0x');

      ffmpeg()
        .input(vfrList)
        .inputOptions(['-f concat', '-safe 0'])
        .input(audioPath)
        .complexFilter([
          // Base de tiempo fina para no perder fotogramas cortos. Los JPEG son de rango completo
          // (yuvj420p) y el slide fijo es RGB: todo pasa a yuv420p de rango TV, el formato que
          // exigen los reproductores. Los slides ya miden 1920×1080.
          `[0:v]settb=1/${VFR_TIMESCALE},scale=1920:1080:out_range=tv,format=yuv420p` +
          (this.subtitlesMode === 'burned'
            ? `,subtitles='${escapedSrt}':force_style='${this.subtitleStyle(opts.brand.primary)}'[base]`
            : '[base]'),
          // Barra de progreso del video completo (abajo, color de la marca)
          `color=c=${bar}:s=1920x${PROGRESS_BAR_HEIGHT}:r=${this.fps}[bar]`,
          `[base][bar]overlay=x='-W+W*(${opts.start.toFixed(3)}+t)/${opts.total.toFixed(3)}':y=H-${PROGRESS_BAR_HEIGHT}:shortest=1,` +
          `fade=t=in:st=0:d=${SCENE_FADE}:color=white,fade=t=out:st=${fadeOut.toFixed(3)}:d=${SCENE_FADE}:color=white[v]`,
          `[1:a]aresample=48000,apad=pad_dur=${opts.pause},` +
          `afade=t=in:st=0:d=0.15,afade=t=out:st=${Math.max(0, duration - 0.25).toFixed(3)}:d=0.25[a]`,
        ])
        .outputOptions([
          '-map [v]', '-map [a]',
          // Calidad: crf 18 evita bandas en los degradados; stillimage favorece contenido tipo slide
          // crf 16 + GOP de 2 s: margen para la recodificación de YouTube sin bandas en los degradados
          '-c:v libx264', `-preset ${this.preset}`, '-tune stillimage', '-crf 16', '-g 60', '-profile:v high', '-level 4.1',
          '-c:a aac', '-b:a 160k', '-ar 48000', '-ac 2',
          '-pix_fmt yuv420p',
          // Frecuencia variable: cada imagen dura lo que indica la lista (los reproductores y
          // YouTube lo admiten; la concatenación final copia el video sin recodificar)
          '-fps_mode vfr', `-video_track_timescale ${VFR_TIMESCALE}`,
          `-t ${duration.toFixed(3)}`,
        ])
        .output(outputPath)
        .on('error', (err: Error) => {
          this.logger.error(`[RendererService] [${jobId}] Escena ${scene.scene_order} error: ${err.message}`);
          reject(err);
        })
        .on('end', () => {
          fs.rmSync(opts.srtPath, { force: true });
          fs.rmSync(vfrList, { force: true });
          resolve(outputPath);
        })
        .run();
    });
  }

  /** Estilo ASS: caja con el color primario de la marca semitransparente, texto blanco. */
  private subtitleStyle(primaryHex: string): string {
    const c = primaryHex.replace('#', '');
    const bgr = /^[0-9a-fA-F]{6}$/.test(c) ? `${c.slice(4, 6)}${c.slice(2, 4)}${c.slice(0, 2)}` : '1A1A1A';
    return `FontName=Arial,FontSize=14,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H30${bgr},` +
      `BackColour=&H30${bgr},BorderStyle=3,Outline=6,Shadow=0,Alignment=2,MarginV=12`;
  }

  // ─── STT: transcribir audio con OpenAI Whisper ───────────────────────────

  // Devuelve null solo si la llamada falló (no se factura); words vacío si no hubo texto.
  private async transcribeAudio(audioPath: string): Promise<{ words: SttWord[]; billedSeconds: number } | null> {
    try {
      const response = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath) as unknown as File,
        model: this.sttModel,
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
      });

      const verbose = response as unknown as {
        duration?: number;
        words?: Array<{ word: string; start: number; end: number }>;
      };
      const billedSeconds = Number(verbose.duration) || 0;

      return {
        billedSeconds,
        words: (verbose.words ?? []).map(w => ({
          text: w.word,
          start: w.start,
          end: w.end,
          type: 'word' as const,
        })),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[RendererService] STT Whisper falló (usando fallback): ${msg}`);
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

  /** Escribe el .srt de la escena y devuelve su ruta (se quema en renderScene, en la misma codificación). */
  private async writeSceneSubtitles(
    scene: VideoScene,
    jobDir: string,
    sttUsage: { audioSeconds: number; calls: number },
  ): Promise<{ srtPath: string; entries: SrtEntry[] }> {
    let entries: SrtEntry[];

    // Texto del guion alineado con los tiempos de Whisper (ortografía y puntuación correctas)
    if (scene.word_timings?.length && scene.narration) {
      entries = buildSubtitleCues(scene.narration, scene.word_timings).map((c, k) => ({
        index: k + 1,
        startMs: Math.round(c.start * 1000),
        endMs: Math.round(c.end * 1000),
        text: c.text,
      }));
    } else if (scene.word_timings?.length) {
      entries = this.groupSttWordsIntoSrt(scene.word_timings.map(w => ({ ...w, type: 'word' as const })));
    } else if (scene.audio_url && fs.existsSync(scene.audio_url)) {
      this.logger.log(`[RendererService] Transcribiendo escena ${scene.scene_order} con Whisper`);
      const stt = await this.sttLimit(() => this.transcribeAudio(scene.audio_url!));
      if (stt) {
        sttUsage.audioSeconds += stt.billedSeconds || (scene.duration_seconds ?? 0);
        sttUsage.calls += 1;
      }
      const words = stt?.words ?? null;
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
    return { srtPath, entries };
  }

  /** WebVTT del video completo: los tiempos de cada escena se desplazan a su inicio global. */
  private buildVtt(sceneSubs: SrtEntry[][], starts: number[]): string {
    const fmt = (ms: number): string => this.formatSrtTime(ms).replace(',', '.');
    const cues = sceneSubs.flatMap((entries, i) => (entries ?? []).map((e) => {
      const off = Math.round(starts[i] * 1000);
      const limit = starts[i + 1] != null ? Math.round(starts[i + 1] * 1000) - 20 : Infinity;
      return `${fmt(e.startMs + off)} --> ${fmt(Math.min(e.endMs + off, limit))}\n${e.text}`;
    }));
    return `WEBVTT\n\n${cues.join('\n\n')}\n`;
  }

  private concatenateScenes(scenePaths: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const concatListPath = `${outputPath}.concat.txt`;
      fs.writeFileSync(concatListPath, scenePaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');

      // -c copy: todos los clips ya son h264/aac con el mismo perfil — stream copy sin re-encodear
      ffmpeg()
        .input(concatListPath).inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          // Video sin recodificar; el audio se normaliza a -16 LUFS (estándar e-learning)
          '-c:v copy',
          '-af loudnorm=I=-16:TP=-1.5:LRA=11',
          '-c:a aac', '-b:a 160k', '-ar 48000',
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
          // Frecuencia variable (VFR): la media cae bajo 30 en los tramos quietos; solo se rechaza
          // un video sin fotogramas o con más de los que el reproductor admite
          const avgFrameRate = videoStream.avg_frame_rate ?? '';
          const [num, den] = avgFrameRate.split('/').map(Number);
          const fps = den && den > 0 ? (num ?? 0) / den : 0;
          if (fps <= 0 || fps > 61) {
            issues.push(`frame rate medio es ${fps.toFixed(2)} fps, fuera de rango`);
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
