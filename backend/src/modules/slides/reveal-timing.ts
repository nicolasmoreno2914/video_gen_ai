// Calcula en qué segundo de la escena aparece cada elemento de on_screen_text,
// a partir de los tiempos por palabra de la voz (Whisper).
//
// Para cada elemento, en orden:
//   1. reveal_cue del guion: frase literal de la narración → inicio de esa frase.
//   2. Palabras clave del propio elemento → primera mención después del anterior.
//   3. Sin coincidencias → reparto uniforme del tiempo restante.
// Luego se fuerza orden creciente y una separación mínima entre apariciones.

export interface WordTiming {
  text: string;
  start: number;
  end: number;
}

const FIRST_REVEAL_MIN = 0.6;   // tras la entrada del encabezado
const MIN_GAP = 1.2;            // separación mínima entre dos apariciones
const LEAD = 0.15;              // aparecer un instante antes de que se pronuncie
const END_MARGIN = 1.0;         // no aparecer en el último segundo de la escena

const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'y', 'o', 'u',
  'que', 'con', 'por', 'para', 'sin', 'se', 'su', 'sus', 'es', 'son', 'lo', 'le', 'les', 'como',
  'mas', 'pero', 'muy', 'ya', 'tu', 'te', 'mi', 'nos', 'este', 'esta', 'estos', 'estas', 'ese', 'esa',
]);

export function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]/g, '');
}

function tokenize(s: string): string[] {
  return s.split(/\s+/).map(normalizeToken).filter(Boolean);
}

/** Coincidencia tolerante a flexiones: igualdad o prefijo común de 5+ letras. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  return n >= 5 && a.slice(0, 5) === b.slice(0, 5);
}

/** Índice de la primera palabra donde aparece la frase (exige las primeras 2–4 palabras). */
function findPhrase(words: string[], phrase: string[], from: number): number {
  const k = Math.min(phrase.length, 4);
  if (k < 2) return -1;
  for (let i = from; i <= words.length - k; i++) {
    let ok = true;
    for (let j = 0; j < k; j++) {
      if (!sameWord(words[i + j], phrase[j])) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

function findKeyword(words: string[], keywords: string[], from: number): number {
  if (keywords.length === 0) return -1;
  for (let i = from; i < words.length; i++) {
    if (keywords.some((k) => sameWord(words[i], k))) return i;
  }
  return -1;
}

export function computeRevealTimes(
  items: string[],
  cues: Array<string | null> | null | undefined,
  timings: WordTiming[] | null | undefined,
  durationSeconds: number,
): number[] {
  const n = items.length;
  if (n === 0) return [];
  const latest = Math.max(FIRST_REVEAL_MIN, durationSeconds - END_MARGIN);
  const words = (timings ?? []).map((w) => normalizeToken(w.text));
  const raw: Array<number | null> = [];
  let cursor = 0;

  for (let i = 0; i < n; i++) {
    let idx = -1;
    const cue = cues?.[i];
    if (cue && words.length) idx = findPhrase(words, tokenize(cue), cursor);
    if (idx < 0 && words.length) {
      const keywords = tokenize(items[i]).filter((t) => t.length > 3 && !STOPWORDS.has(t));
      idx = findKeyword(words, keywords, cursor);
    }
    if (idx >= 0) {
      raw.push(timings![idx].start - LEAD);
      cursor = idx + 1;
    } else {
      raw.push(null);
    }
  }

  // Rellenar huecos repartiendo entre el anterior conocido y el siguiente conocido (o el final)
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = raw[i];
    if (v != null) { times.push(v); continue; }
    const prev = i > 0 ? times[i - 1] : FIRST_REVEAL_MIN - MIN_GAP;
    let j = i + 1;
    while (j < n && raw[j] == null) j++;
    const next = j < n ? (raw[j] as number) : latest;
    const slots = j - i + 1;
    times.push(prev + (next - prev) / slots);
  }

  // Orden creciente con separación mínima, dentro de [FIRST_REVEAL_MIN, latest]
  for (let i = 0; i < n; i++) {
    const min = i === 0 ? FIRST_REVEAL_MIN : times[i - 1] + MIN_GAP;
    times[i] = Math.max(times[i], min);
  }
  // Si se pasaron del final, comprimir hacia atrás manteniendo el orden
  for (let i = n - 1; i >= 0; i--) {
    const max = i === n - 1 ? latest : times[i + 1] - 0.4;
    times[i] = Math.max(0, Math.min(times[i], max));
  }
  return times.map((t) => Math.round(t * 100) / 100);
}
