import * as fs from 'fs';
import * as path from 'path';
import type { Page } from 'puppeteer';

// Captura por fotogramas clave de un slide animado (ver templates/animation.ts).
//
// En vez de capturar duración × fps fotogramas, solo se capturan los intervalos con
// movimiento a `fps`; cada tramo quieto se representa con UNA imagen y su duración.
// El resultado es una lista para el demuxer concat de FFmpeg (imagen + duration).

export interface KeyframeCaptureResult {
  /** Archivo de lista para `ffmpeg -f concat -safe 0 -i <listPath>`. */
  listPath: string;
  frameCount: number;
}

interface Sample {
  time: number;
  hold: number;
  still?: boolean;
}

/** Intervalo con movimiento; el tercer valor (opcional) limita los fps de captura en ese tramo. */
export type MotionWindow = [number, number] | [number, number, number];

/**
 * Calcula en qué instantes capturar y cuánto dura cada imagen. Cada tramo entre dos bordes de
 * ventana se captura al mayor ritmo de las ventanas que lo cubren (o con una sola imagen si
 * ninguna lo cubre).
 */
export function planKeyframes(windows: MotionWindow[], durationSeconds: number, fps: number): Sample[] {
  const clipped = windows
    .map(([s, e, r]) => ({ start: Math.max(0, s), end: Math.min(durationSeconds, e), rate: Math.min(r ?? fps, fps) }))
    .filter((w) => w.end > w.start && w.rate > 0);

  const bounds = Array.from(new Set([0, durationSeconds, ...clipped.flatMap((w) => [w.start, w.end])]))
    .sort((a, b) => a - b);

  const samples: Sample[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const [a, b] = [bounds[i], bounds[i + 1]];
    const mid = (a + b) / 2;
    const rate = Math.max(0, ...clipped.filter((w) => w.start <= mid && mid < w.end).map((w) => w.rate));
    if (rate === 0) {
      // Tramo quieto: una imagen sostenida (se une a la anterior si también era quieta)
      const last = samples[samples.length - 1];
      if (last?.still) last.hold += b - a;
      else samples.push({ time: a, hold: b - a, still: true });
      continue;
    }
    const step = 1 / rate;
    for (let t = a; t < b - 1e-9; t += step) {
      samples.push({ time: t, hold: Math.min(step, b - t) });
    }
  }
  return samples.filter((s) => s.hold > 0.0005).map(({ time, hold }) => ({ time, hold }));
}

export async function captureKeyframes(
  page: Page,
  outDir: string,
  durationSeconds: number,
  fps: number,
): Promise<KeyframeCaptureResult> {
  fs.mkdirSync(outDir, { recursive: true });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const windows = await page.evaluate(
    () => (window as unknown as { __anim?: { motionWindows(): MotionWindow[] } }).__anim?.motionWindows() ?? [],
  );
  const samples = planKeyframes(windows, durationSeconds, fps);

  const lines: string[] = [];
  let lastFile = '';
  for (let i = 0; i < samples.length; i++) {
    const { time, hold } = samples[i];
    await page.evaluate((t: number) => {
      (window as unknown as { __anim?: { seek(t: number): void } }).__anim?.seek(t);
    }, time);
    const file = path.join(outDir, `f_${String(i).padStart(5, '0')}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92, optimizeForSpeed: true });
    lines.push(`file '${file.replace(/'/g, "'\\''")}'`, `duration ${hold.toFixed(4)}`);
    lastFile = file;
  }
  // El demuxer concat ignora la duración de la última entrada si no se repite el archivo
  if (lastFile) lines.push(`file '${lastFile.replace(/'/g, "'\\''")}'`);

  const listPath = path.join(outDir, 'frames.txt');
  fs.writeFileSync(listPath, lines.join('\n'), 'utf8');
  return { listPath, frameCount: samples.length };
}
