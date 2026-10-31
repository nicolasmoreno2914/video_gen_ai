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
}

/** Calcula en qué instantes capturar y cuánto dura cada imagen. */
export function planKeyframes(windows: Array<[number, number]>, durationSeconds: number, fps: number): Sample[] {
  const step = 1 / fps;
  const samples: Sample[] = [];
  let cursor = 0;

  const clipped = windows
    .map(([s, e]) => [Math.max(0, s), Math.min(durationSeconds, e)] as [number, number])
    .filter(([s, e]) => e > s);

  for (const [start, end] of clipped) {
    if (start > cursor) {
      // Tramo quieto antes del movimiento: una imagen sostenida
      samples.push({ time: cursor, hold: start - cursor });
      cursor = start;
    }
    for (let t = Math.max(cursor, start); t < end; t += step) {
      samples.push({ time: t, hold: Math.min(step, durationSeconds - t) });
      cursor = t + step;
    }
  }

  if (cursor < durationSeconds) {
    samples.push({ time: cursor, hold: durationSeconds - cursor });
  }
  return samples.filter((s) => s.hold > 0.0005);
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
    () => (window as unknown as { __anim?: { motionWindows(): Array<[number, number]> } }).__anim?.motionWindows() ?? [],
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
