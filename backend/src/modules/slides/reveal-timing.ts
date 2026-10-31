// Calcula en qué segundo de la escena aparece cada elemento de on_screen_text,
// a partir de los tiempos por palabra de la voz (Whisper).
//
// Para cada elemento se busca, en toda la escena, la ventana de narración que más
// palabras clave del elemento contiene (los números se comparan como palabras:
// Whisper escribe "43" y el guion "cuarenta y tres"). La reveal_cue del guion solo
// se usa si comparte alguna palabra clave con su elemento (evita cues corridos).
// Sin coincidencias → reparto uniforme. Luego se fuerza una separación mínima.

export interface WordTiming {
  text: string;
  start: number;
  end: number;
}

const FIRST_REVEAL_MIN = 0.4;   // tras la entrada del encabezado
const MIN_GAP = 1.2;            // separación mínima entre dos apariciones
const LEAD = 0.15;              // aparecer un instante antes de que se pronuncie
const END_MARGIN = 1.0;         // no aparecer en el último segundo de la escena
const WINDOW = 10;              // palabras de narración por ventana de búsqueda

const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'y', 'o', 'u', 'e',
  'que', 'con', 'por', 'para', 'sin', 'se', 'su', 'sus', 'es', 'son', 'lo', 'le', 'les', 'como', 'tras',
  'mas', 'pero', 'muy', 'ya', 'tu', 'te', 'mi', 'nos', 'este', 'esta', 'estos', 'estas', 'ese', 'esa',
]);

export function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]/g, '');
}

const UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidos', 'veintitres', 'veinticuatro', 'veinticinco', 'veintiseis', 'veintisiete', 'veintiocho', 'veintinueve'];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos',
  'setecientos', 'ochocientos', 'novecientos'];

/** Número entero (0–999.999) en palabras en español, sin tildes (para comparar tokens). */
export function numberToSpanish(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1_000_000) return String(n);
  if (n < 30) return UNITS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` y ${UNITS[n % 10]}` : '');
  if (n === 100) return 'cien';
  if (n < 1000) return HUNDREDS[Math.floor(n / 100)] + (n % 100 ? ` ${numberToSpanish(n % 100)}` : '');
  const thousands = Math.floor(n / 1000);
  const head = thousands === 1 ? 'mil' : `${numberToSpanish(thousands)} mil`;
  return head + (n % 1000 ? ` ${numberToSpanish(n % 1000)}` : '');
}

/** Tokens normalizados; los números escritos con cifras se expanden a palabras. */
function tokenize(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.split(/\s+/)) {
    // "1898:", "(43%)", "254." → número limpio
    const clean = raw.replace(/[.,:;!?¿¡()"'«»]/g, '');
    if (/^\d+%?$/.test(clean)) {
      out.push(...numberToSpanish(Number(clean.replace('%', ''))).split(' '));
      if (clean.endsWith('%')) out.push('por', 'ciento');
    } else {
      const t = normalizeToken(raw);
      if (t) out.push(t);
    }
  }
  return out;
}

/** Coincidencia tolerante a flexiones ("planear" ~ "planificación", "automático" ~ "automatización"). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n >= 5 && a.slice(0, 5) === b.slice(0, 5)) return true;
  return a.length >= 6 && b.length >= 6 && a.slice(0, 4) === b.slice(0, 4);
}

function keywordsOf(s: string): string[] {
  return Array.from(new Set(tokenize(s).filter((t) => (t.length > 3 || /^\d/.test(t)) && !STOPWORDS.has(t))));
}

/**
 * Inicio de la mención de un elemento: la ventana MÁS TEMPRANA (desde preferAfter si es posible)
 * cuyo puntaje sea ≥ 60 % del mejor, anclada en la primera palabra clave DEL ELEMENTO dentro de
 * ella (no en las palabras de introducción de la cue, como "El segundo…").
 */
function bestWindow(words: string[], keywords: string[], itemKeys: string[], preferAfter: number): number {
  if (!keywords.length) return -1;
  const scores: Array<{ i: number; score: number }> = [];
  for (let i = 0; i < words.length; i++) {
    if (!keywords.some((k) => sameWord(words[i], k))) continue; // la ventana empieza en una palabra clave
    const window = words.slice(i, i + WINDOW);
    scores.push({ i, score: keywords.filter((k) => window.some((w) => sameWord(w, k))).length });
  }
  if (!scores.length) return -1;
  const max = Math.max(...scores.map((s) => s.score));
  // Con 2+ claves, una coincidencia suelta ("solo", "fácil") no basta para anclar
  const floor = itemKeys.length >= 2 && max >= 2 ? 2 : 1;
  const good = scores.filter((s) => s.score >= Math.max(floor, Math.ceil(max * 0.6)));
  const pick = good.find((s) => s.i >= preferAfter) ?? good[0];
  for (let j = pick.i; j < Math.min(words.length, pick.i + WINDOW); j++) {
    if (itemKeys.some((k) => sameWord(words[j], k))) return j;
  }
  return pick.i;
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
  const ws = timings ?? [];
  // Cada palabra de Whisper puede expandirse a varias ("43" → cuarenta y tres): mapa a su índice original
  const flat: string[] = [];
  const owner: number[] = [];
  ws.forEach((w, idx) => tokenize(w.text).forEach((t) => { flat.push(t); owner.push(idx); }));

  const raw: Array<number | null> = [];
  let prevIdx = 0;
  for (let i = 0; i < n; i++) {
    const keys = keywordsOf(items[i]);
    const cue = cues?.[i] ?? null;
    let idx = -1;
    // Hitos con fecha o cifra inicial ("1938: Skinner…", "43% …"): la cifra es el ancla más fiable
    const lead = items[i].match(/^\s*(\d{1,4}%?)/);
    if (lead && flat.length) {
      const numKeys = tokenize(lead[1]).filter((t) => !STOPWORDS.has(t));
      idx = bestWindow(flat, numKeys, numKeys, prevIdx);
    }
    // La cue solo cuenta si comparte alguna palabra clave con su elemento
    if (idx < 0 && cue && flat.length) {
      const cueKeys = keywordsOf(cue);
      if (cueKeys.some((c) => keys.some((k) => sameWord(c, k)))) idx = bestWindow(flat, [...new Set([...cueKeys, ...keys])], keys, prevIdx);
    }
    if (idx < 0 && flat.length) idx = bestWindow(flat, keys, keys, prevIdx);
    if (idx >= 0) {
      raw.push(ws[owner[idx]].start - LEAD);
      prevIdx = idx + 1;
    } else {
      raw.push(null);
    }
  }

  // Huecos: repartir entre el anterior conocido y el siguiente conocido (o el final)
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

  // Separación mínima respetando el orden en que se mencionan (no el orden de la lista)
  const order = times.map((t, i) => ({ t, i })).sort((a, b) => a.t - b.t || a.i - b.i);
  let last = -Infinity;
  order.forEach((o, k) => {
    const t = Math.max(o.t, k === 0 ? FIRST_REVEAL_MIN : last + MIN_GAP);
    o.t = Math.min(t, latest);
    last = o.t;
  });
  // Si se pasaron del final, comprimir hacia atrás manteniendo el orden
  for (let k = order.length - 2; k >= 0; k--) {
    order[k].t = Math.min(order[k].t, order[k + 1].t - 0.4);
  }
  const out = new Array<number>(n);
  order.forEach((o) => { out[o.i] = Math.round(Math.max(0, o.t) * 100) / 100; });
  return out;
}
