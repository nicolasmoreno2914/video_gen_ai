// Subtítulos a partir del TEXTO DEL GUION (ortografía y puntuación correctas), usando
// los tiempos por palabra de Whisper solo para alinear. Antes se mostraba la transcripción
// en bruto de Whisper ("ganglios pasales", "43" sin "%", sin puntuación).

import { normalizeToken, numberToSpanish } from '../slides/reveal-timing';

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

const MAX_CHARS = 42;
const MIN_CHARS = 20;
// No cortar una línea después de estas palabras (artículos, preposiciones, conjunciones)
const NO_BREAK_AFTER = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'y', 'o', 'u', 'e',
  'que', 'con', 'por', 'para', 'sin', 'se', 'su', 'sus', 'lo', 'le', 'mi', 'tu', 'como', 'pero', 'ni', 'muy', 'más',
]);

/** Tokens comparables: los números de Whisper ("43", "1898") se expanden a palabras. */
function expandSttTokens(words: TimedWord[]): Array<{ norm: string; start: number; end: number }> {
  const out: Array<{ norm: string; start: number; end: number }> = [];
  for (const w of words) {
    const raw = w.text.trim();
    const digits = raw.replace(/[^\d]/g, '');
    if (/^\d+%?$/.test(raw.replace(/[.,]/g, '')) && digits) {
      const parts = numberToSpanish(Number(digits)).split(' ');
      if (raw.includes('%')) parts.push('por', 'ciento');
      parts.forEach((p, i) => {
        const span = (w.end - w.start) / parts.length;
        out.push({ norm: normalizeToken(p), start: w.start + span * i, end: w.start + span * (i + 1) });
      });
    } else {
      const n = normalizeToken(raw);
      if (n) out.push({ norm: n, start: w.start, end: w.end });
    }
  }
  return out;
}

/** Asigna un tiempo a cada palabra del guion (LCS con Whisper + interpolación). */
export function alignScriptWords(narration: string, words: TimedWord[]): TimedWord[] {
  const script = narration.split(/\s+/).filter(Boolean);
  const scriptNorm = script.map((t) => normalizeToken(t));
  const stt = expandSttTokens(words);
  const n = scriptNorm.length;
  const m = stt.length;
  if (n === 0) return [];

  // LCS por programación dinámica (escenas de ≤ ~150 palabras: costo despreciable)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const same = (a: string, b: string): boolean => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = scriptNorm[i] && same(scriptNorm[i], stt[j].norm) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const times: Array<{ start: number; end: number } | null> = new Array(n).fill(null);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (scriptNorm[i] && same(scriptNorm[i], stt[j].norm)) {
      times[i] = { start: stt[j].start, end: stt[j].end };
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }

  // Interpolar las palabras sin pareja entre las vecinas con tiempo
  const total = words.length ? words[words.length - 1].end : n * 0.4;
  for (let k = 0; k < n; k++) {
    if (times[k]) continue;
    let a = k - 1;
    while (a >= 0 && !times[a]) a--;
    let b = k + 1;
    while (b < n && !times[b]) b++;
    const t0 = a >= 0 ? times[a]!.end : 0;
    const t1 = b < n ? times[b]!.start : total;
    const slots = b - a;
    const span = (t1 - t0) / slots;
    for (let q = a + 1; q < b; q++) times[q] = { start: t0 + span * (q - a - 1), end: t0 + span * (q - a) };
    k = b - 1;
  }
  return script.map((text, k) => ({ text, start: times[k]!.start, end: times[k]!.end }));
}

/** Agrupa en líneas cortas que terminan en puntuación o pausa, nunca tras un artículo/preposición. */
export function buildSubtitleCues(narration: string, words: TimedWord[]): SubtitleCue[] {
  const aligned = alignScriptWords(narration, words);
  const cues: SubtitleCue[] = [];
  let cur: TimedWord[] = [];
  const flush = (): void => {
    if (!cur.length) return;
    cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(' ') });
    cur = [];
  };
  for (let k = 0; k < aligned.length; k++) {
    const w = aligned[k];
    const next = aligned[k + 1];
    cur.push(w);
    const len = cur.map((x) => x.text).join(' ').length;
    const endsSentence = /[.!?…:;]$/.test(w.text);
    const comma = /,$/.test(w.text);
    const pause = next ? next.start - w.end > 0.25 : true;
    // No dejar una o dos palabras sueltas antes del final de la frase
    const rest = aligned.slice(k + 1, k + 3);
    const orphan = rest.length > 0 && rest.findIndex((x) => /[.!?…:;]$/.test(x.text)) >= 0 && len + rest.map((x) => x.text.length + 1).reduce((a, b) => a + b, 0) <= MAX_CHARS + 10;
    const nextLen = next ? len + 1 + next.text.length : Infinity;
    const canBreak = !NO_BREAK_AFTER.has(normalizeToken(w.text));
    if (endsSentence || (canBreak && !orphan && len >= MIN_CHARS && (comma || pause || nextLen > MAX_CHARS))) flush();
    else if (len > MAX_CHARS + 12) flush(); // seguridad: nunca líneas larguísimas
  }
  flush();
  // Cada subtítulo dura hasta que empieza el siguiente (máx. +0,8 s) para no parpadear
  return cues.map((c, k) => ({
    ...c,
    end: Math.max(c.end, Math.min(cues[k + 1]?.start ?? c.end + 0.8, c.end + 0.8)),
  }));
}
