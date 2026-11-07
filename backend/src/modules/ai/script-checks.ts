import type { GeneratedScript } from '../../common/types';
import { normalizeToken } from '../slides/reveal-timing';

// Revisiones determinísticas del guion completo, después de la revisión editorial de la IA:
//  - cifras que no están en el capítulo (la IA "completa" datos: un límite de velocidad inventado
//    en un curso de conducción es grave);
//  - escenas que solo hacen preguntas o anuncian el temario sin explicar (las preguntas del video
//    interactivo de Cursia caen ahí y preguntan algo que aún no se explicó).
// Devuelven problemas en español para pedirle a la IA la corrección.

const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600,
  seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
  novecientos: 900, novecientas: 900,
};

/** Unidades que vuelven "dato" a una cifra chica ("dos segundos", "5 %"). */
const FACT_UNITS = new Set([
  'segundo', 'segundos', 'minuto', 'minutos', 'hora', 'horas', 'dia', 'dias', 'semana', 'semanas', 'mes',
  'meses', 'ano', 'anos', 'metro', 'metros', 'km', 'kmh', 'kilometro', 'kilometros', 'kilo', 'kilos',
  'kilogramo', 'kilogramos', 'gramo', 'gramos', 'litro', 'litros', 'grado', 'grados', 'porciento', 'por',
  'pesos', 'peso', 'dolares', 'salario', 'salarios', 'smmlv', 'puntos', 'veces', 'cm', 'mm', 'kg', 'mg', 'ml',
]);

interface Found { value: number; next: string }

/**
 * Cifras de un texto, escritas con números o con palabras ("ochenta", "ciento veinte", "3.500").
 * Junto a cada una va la palabra siguiente, para saber si es un dato con unidad.
 */
export function numbersInText(text: string): Found[] {
  const out: Found[] = [];
  // Con cifras: no las pegadas a letras ("A1", "COVID-19" sí cuenta por el guion)
  const digitRe = /(?<![\p{L}\d])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(%|\p{L}+)?/gu;
  for (const m of text.matchAll(digitRe)) {
    const t = m[1]!;
    const value = /^\d{1,3}([.,]\d{3})+$/.test(t) ? Number(t.replace(/[.,]/g, '')) : Number(t.replace(',', '.'));
    if (Number.isFinite(value)) out.push({ value, next: m[2] === '%' ? 'porciento' : normalizeToken(m[2] ?? '') });
  }
  // Con palabras: se leen secuencias ("ciento veinte mil", "treinta y cinco")
  const raw = text.split(/\s+/).filter((r) => normalizeToken(r));
  const tokens = raw.map(normalizeToken);
  // Una coma o un punto cortan la cifra ("treinta y cinco, ciento veinte" son dos)
  const ends = raw.map((r) => /[.,;:!?)»"]$/.test(r));
  for (let i = 0; i < tokens.length; i++) {
    const start = i;
    let total = 0;
    let group = 0;
    let any = false;
    while (i < tokens.length) {
      if (any && ends[i - 1]) break;
      const w = tokens[i]!;
      if (w in HUNDREDS) group += HUNDREDS[w]!;
      else if (w in TENS) group += TENS[w]!;
      else if (w in UNITS && !(any && group % 10 !== 0 && group < 100)) group += UNITS[w]!;
      else if (w === 'y' && any && i + 1 < tokens.length && tokens[i + 1]! in UNITS) { i++; continue; }
      else if (w === 'mil') { total += (group || 1) * 1000; group = 0; }
      else break;
      any = true;
      i++;
    }
    if (any) {
      // "un", "una" sueltos son artículos, no cifras
      const single = i - start === 1 ? tokens[start]! : '';
      if (!['un', 'una', 'uno'].includes(single)) out.push({ value: total + group, next: tokens[i] ?? '' });
    }
    if (i > start) i--;
  }
  return out;
}

/** ¿Es una cifra que hay que respaldar con la fuente? Las chicas sin unidad son conteos ("tres pasos"). */
function isFact(f: Found): boolean {
  return f.value > 10 || !Number.isInteger(f.value) || FACT_UNITS.has(f.next);
}

export interface UnsupportedNumber { scene: number; value: number }

/** Cifras del guion (narración y pantalla) que no aparecen en el capítulo, ni con números ni con palabras. */
export function unsupportedNumbers(script: GeneratedScript, source: string): UnsupportedNumber[] {
  const known = new Set(numbersInText(source).map((f) => f.value));
  const out: UnsupportedNumber[] = [];
  for (const s of script.scenes) {
    const text = [s.narration ?? '', ...(s.on_screen_text ?? []).map(String), s.title ?? ''].join(' \n ');
    const seen = new Set<number>();
    for (const f of numbersInText(text)) {
      if (!isFact(f) || known.has(f.value) || seen.has(f.value)) continue;
      seen.add(f.value);
      out.push({ scene: s.scene_order, value: f.value });
    }
  }
  return out;
}

/** Preguntas que hace una narración (sin contar la de una escena de práctica). */
function questionCount(narration: string): number {
  return (narration.match(/\?/g) ?? []).length;
}

const INTRO_TYPES = new Set(['hook', 'context']);
/** Máximo de escenas de apertura + contexto, y su parte máxima de la narración. */
export const MAX_INTRO_SCENES = 2;
const MAX_INTRO_SHARE = 0.25;
/** Frases de temario: la escena anuncia lo que vendrá en vez de explicarlo. */
const AGENDA = /\b(preguntas? (clave|centrales?|guia)|en este capitulo|veremos|vamos a ver|vas a (aprender|descubrir|construir|resolver)|resolveras|responderemos|organizan el camino|lo que (veremos|aprenderas)|antes de buscar respuestas)\b/;

function normalizeText(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Parte inicial del video donde una escena llena de preguntas es un "temario" y no una explicación. */
const OPENING_SHARE = 0.35;

/**
 * Problemas de estructura: escenas de temario al comienzo (varias preguntas y frases como "en este
 * capítulo" o "preguntas clave", después del gancho) y una apertura demasiado larga antes de empezar a enseñar. Más
 * adelante en el video, varias preguntas suelen ser criterios o pasos ("¿quién emite?, ¿propósito?")
 * y no se marcan.
 */
export function structureIssues(script: GeneratedScript): string[] {
  const issues: string[] = [];
  const words = (t: string): number => t.replace(/\[PAUSA\]/g, ' ').split(/\s+/).filter(Boolean).length;
  const total = script.scenes.reduce((a, s) => a + words(s.narration ?? ''), 0) || 1;
  let before = 0;
  for (const [i, s] of script.scenes.entries()) {
    const start = before / total;
    before += words(s.narration ?? '');
    // El gancho puede abrir con preguntas; la práctica pregunta por diseño
    if (i === 0 || s.scene_type === 'hook' || s.scene_type === 'practice' || s.layout_type === 'practice_question') continue;
    if (start >= OPENING_SHARE) break;
    const q = questionCount(s.narration ?? '');
    if (q >= 2 && AGENDA.test(normalizeText(s.narration ?? ''))) {
      issues.push(`la escena ${s.scene_order} ("${s.title}") solo anuncia el temario con ${q} preguntas que se responden ` +
        'después: ELIMÍNALA (o déjala en una frase dentro del contexto) para que el video empiece a explicar antes');
    }
  }
  const intro = script.scenes.filter((s) => INTRO_TYPES.has(s.scene_type));
  const introWords = intro.reduce((a, s) => a + words(s.narration ?? ''), 0);
  if (intro.length > MAX_INTRO_SCENES || introWords / total > MAX_INTRO_SHARE) {
    issues.push(`la apertura (gancho + contexto) ocupa ${intro.length} escenas y ${Math.ceil((introWords / total) * 100)} % ` +
      `de la narración: déjala en máximo ${MAX_INTRO_SCENES} escenas y ${Math.round(MAX_INTRO_SHARE * 100)} %`);
  }
  return issues;
}
