import * as fs from 'fs';

// Lista de fotogramas con duración variable (VFR) para el demuxer concat de FFmpeg.
//
// Codificar a 30 fps constantes obliga a FFmpeg a procesar (subtítulos, barra, fundidos y x264)
// cientos de copias de la misma imagen: en el VPS eso dominaba el tiempo de render. Aquí solo se
// emite un fotograma cuando algo cambia en pantalla: la animación del slide, el inicio o fin de
// un subtítulo, los fundidos de entrada/salida y la barra de progreso (cada `maxHold` segundos).

export interface FrameEntry {
  file: string;
  hold: number;
}

/** Lee una lista concat (`file '…'` + `duration N`) generada por la captura de fotogramas clave. */
export function readFramesList(listPath: string): FrameEntry[] {
  const entries: FrameEntry[] = [];
  let file: string | null = null;
  for (const line of fs.readFileSync(listPath, 'utf8').split('\n')) {
    const f = line.match(/^file '(.*)'$/);
    if (f) {
      file = f[1].replace(/'\\''/g, "'");
      continue;
    }
    const d = line.match(/^duration ([\d.]+)$/);
    if (d && file) entries.push({ file, hold: Number(d[1]) });
  }
  return entries;
}

export interface VfrOptions {
  /** Duración total de la escena (voz + pausa). La última imagen se sostiene hasta aquí. */
  duration: number;
  /** Instantes (s) en que cambia algo superpuesto, p. ej. inicio y fin de cada subtítulo. */
  cuts: number[];
  /** fps durante los fundidos de entrada y salida. */
  fps: number;
  /** Duración de cada fundido (s). */
  fade: number;
  /** Máximo que se sostiene una imagen (s): ritmo al que avanza la barra de progreso. */
  maxHold: number;
}

export function buildVfrEntries(frames: FrameEntry[], opts: VfrOptions): FrameEntry[] {
  if (!frames.length) return [];
  const { duration, fps, fade, maxHold } = opts;

  // Línea de tiempo de origen recortada o extendida a la duración de la escena
  const source: Array<{ file: string; start: number; end: number }> = [];
  let t = 0;
  for (const f of frames) {
    if (t >= duration) break;
    source.push({ file: f.file, start: t, end: Math.min(duration, t + f.hold) });
    t += f.hold;
  }
  source[source.length - 1].end = duration;

  const cuts = opts.cuts.filter((c) => c > 0 && c < duration).sort((a, b) => a - b);
  const dense = (x: number): boolean => x < fade || x >= duration - fade;
  const out: FrameEntry[] = [];
  let ci = 0;
  for (const s of source) {
    let cur = s.start;
    while (s.end - cur > 1e-6) {
      let next = Math.min(s.end, cur + (dense(cur) ? 1 / fps : maxHold));
      // Al entrar en el fundido de salida, cortar justo en su inicio
      if (!dense(cur) && next > duration - fade) next = Math.max(cur + 1e-3, duration - fade);
      while (ci < cuts.length && cuts[ci] <= cur + 1e-6) ci++;
      if (ci < cuts.length && cuts[ci] < next - 1e-6) next = cuts[ci];
      out.push({ file: s.file, hold: next - cur });
      cur = next;
    }
  }
  return out;
}

export function writeFramesList(entries: FrameEntry[], listPath: string): void {
  const esc = (p: string): string => `file '${p.replace(/'/g, "'\\''")}'`;
  const lines = entries.flatMap((e) => [esc(e.file), `duration ${e.hold.toFixed(5)}`]);
  // El demuxer concat ignora la duración de la última entrada si no se repite el archivo
  if (entries.length) lines.push(esc(entries[entries.length - 1].file));
  fs.writeFileSync(listPath, lines.join('\n'), 'utf8');
}
