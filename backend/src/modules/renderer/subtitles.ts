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

// Hasta 2 líneas de ≤ 42 caracteres por subtítulo (estándar de legibilidad)
const LINE_CHARS = 42;
const MAX_CHARS = 64;
const MIN_CHARS = 20;
const MIN_DURATION = 1.0;
const MAX_MERGE_GAP = 0.6; // s: una pausa mayor separa ideas y nunca se fusiona
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
  const script = narration.replace(/\[PAUSA\]/g, ' ').split(/\s+/).filter(Boolean);
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

const NUM_WORDS: Record<string, number> = {
  cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};

/**
 * Para leer, las cifras se entienden mejor con dígitos: "cuarenta y tres por ciento" → "43 %",
 * "mil ochocientos noventa y ocho" → "1898". Solo convierte secuencias de 2+ palabras numéricas
 * o con "mil"/"por ciento" (deja "un hábito", "dos páginas" como están).
 */
export function numbersToDigits(text: string): string {
  const tokens = text.split(' ');
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    let j = i;
    let total = 0;
    let current = 0;
    let count = 0;
    let usedMil = false;
    let last = -1; // último valor sumado: "y" solo une decenas (30–90) con unidades (1–9)
    while (j < tokens.length) {
      const raw = tokens[j];
      const w = normalizeToken(raw);
      if (w in NUM_WORDS) {
        const v = NUM_WORDS[w];
        // un número nuevo que no compone con el anterior ("dieciocho" … "doscientos") corta la secuencia
        if (count > 0 && !(last >= 100 && v < 100) && !(last >= 1000) && !(last % 100 === 0 && last >= 100 && v < 100) && !(last >= 20 && last < 100 && last % 10 === 0 && v < 10)) break;
        current += v; count++; last = v;
      }
      else if (w === 'mil') { total += (current || 1) * 1000; current = 0; count++; usedMil = true; last = 1000; }
      else if (w === 'y' && last >= 30 && last < 100 && last % 10 === 0 && j + 1 < tokens.length && (NUM_WORDS[normalizeToken(tokens[j + 1])] ?? 99) < 10) { j++; continue; }
      else break;
      j++;
      if (/[,.;:!?]$/.test(raw)) break; // la puntuación cierra el número
    }
    const isPercent = normalizeToken(tokens[j] ?? '') === 'por' && normalizeToken(tokens[j + 1] ?? '').startsWith('ciento');
    // También números de una palabra a partir de 10 ("dieciocho" → 18, "veintiún" → 21)
    if (count >= 2 || usedMil || (count === 1 && (isPercent || current >= 10))) {
      const value = total + current;
      const lastRaw = isPercent ? tokens[j + 1] : tokens[j - 1];
      const trail = (lastRaw.match(/[,.;:!?]+$/) ?? [''])[0];
      out.push(`${value}${isPercent ? ' %' : ''}${trail}`);
      i = isPercent ? j + 2 : j;
    } else {
      out.push(tokens[i]);
      i++;
    }
  }
  return out.join(' ').replace(/'([^']+)'/g, '"$1"');
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
    // Iniciales y abreviaturas ("B.", "F.", "Dr.", "EE.") no terminan frase; los dos puntos solo
    // cortan si la línea ya tiene cuerpo ("Primero:" no queda solo)
    const abbrev = /^([A-ZÁÉÍÓÚÑ]|Dr|Dra|Sr|Sra|EE|UU|etc)\.$/.test(w.text);
    const endsSentence = !abbrev && (/[.!?…;]$/.test(w.text) || (/:$/.test(w.text) && cur.map((x) => x.text).join(' ').length >= MIN_CHARS));
    const comma = /,$/.test(w.text);
    const pause = next ? next.start - w.end > 0.25 : true;
    // No dejar una o dos palabras sueltas antes del final de la frase
    const rest = aligned.slice(k + 1, k + 3);
    const orphan = rest.length > 0 && rest.findIndex((x) => /[.!?…:;]$/.test(x.text)) >= 0 && len + rest.map((x) => x.text.length + 1).reduce((a, b) => a + b, 0) <= MAX_CHARS + 14;
    const nextLen = next ? len + 1 + next.text.length : Infinity;
    // No separar un número de su unidad ("66 / días"), no partir un número dicho en palabras
    // ("cuarenta y / tres por ciento") ni cortar tras una abreviatura
    const wn = normalizeToken(w.text);
    const nn = next ? normalizeToken(next.text) : '';
    const inNumber = (wn in NUM_WORDS || wn === 'mil' || wn === 'y' || wn === 'por') &&
      (nn in NUM_WORDS || nn === 'mil' || nn === 'y' || nn === 'por' || nn.startsWith('ciento'));
    const numericEnd = (wn in NUM_WORDS || /^\d/.test(w.text)) && !/[,.;:!?]$/.test(w.text);
    const canBreak = !NO_BREAK_AFTER.has(wn) && !/^\d+[.,]?\d*%?$/.test(w.text) && !abbrev && !inNumber && !numericEnd;
    if (endsSentence || (canBreak && !orphan && len >= MIN_CHARS && (comma || pause || nextLen > MAX_CHARS))) flush();
    else if (len > MAX_CHARS + 12) flush(); // seguridad: nunca líneas larguísimas
  }
  flush();
  // Fusionar líneas de menos de 1 s con la siguiente si caben (evita destellos como "F."), salvo
  // que haya una pausa entre ambas: en la práctica, "Piénsalo un momento." no puede arrastrar la
  // respuesta, que se dice después de 5 s de silencio
  const merged: SubtitleCue[] = [];
  for (const c of cues) {
    const prev = merged[merged.length - 1];
    if (prev && prev.end - prev.start < MIN_DURATION && c.start - prev.end < MAX_MERGE_GAP &&
      (prev.text + ' ' + c.text).length <= MAX_CHARS + 14) {
      prev.text = `${prev.text} ${c.text}`;
      prev.end = c.end;
    } else merged.push({ ...c });
  }
  // Cada subtítulo dura hasta que empieza el siguiente (máx. +0,8 s), sin solaparse
  return merged.map((c, k) => {
    const next = merged[k + 1]?.start;
    const end = Math.max(c.end, Math.min(next ?? c.end + 0.8, c.end + 0.8));
    return { ...c, text: twoLines(numbersToDigits(c.text)), end: next != null ? Math.min(end, next - 0.02) : end };
  });
}

/** Parte en dos líneas equilibradas si pasa de 42 caracteres. */
function twoLines(text: string): string {
  if (text.length <= LINE_CHARS) return text;
  const words = text.split(' ');
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    // preferir cortar tras puntuación y nunca tras artículo/preposición
    const penalty = NO_BREAK_AFTER.has(normalizeToken(words[i - 1])) ? 30 : /[,.;:]$/.test(words[i - 1]) ? -8 : 0;
    const diff = Math.abs(a.length - b.length) + penalty + (Math.max(a.length, b.length) > LINE_CHARS ? 40 : 0);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return `${words.slice(0, best).join(' ')}\n${words.slice(best).join(' ')}`;
}
