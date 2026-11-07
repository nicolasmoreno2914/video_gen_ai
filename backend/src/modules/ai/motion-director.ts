import { Logger } from '@nestjs/common';
import { GeneratedScene, GeneratedScript } from '../../common/types';
import { illustrationCatalogText } from '../slides/motion/assets';
import { MotionPreview } from '../slides/motion/preview';
import { MotionSpec, MotionSpecError } from '../slides/motion/spec';
import { numberToSpanish } from '../slides/reveal-timing';
import { SIGNS } from '../slides/motion/signs';
import { prepareMotionSpec } from '../slides/motion/auto-layout';

// Director de animación: después del guion, elige las escenas que se entienden mejor con una
// animación y le pide a la IA el guion de animación de cada una. Cada guion se valida y se revisa
// su distribución en el navegador; si falla, se reintenta una vez con la explicación del problema
// y, si vuelve a fallar, la escena queda con su diseño normal. Nunca hace fallar el video.

export type JsonCall = (
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  operation: string,
  model?: string,
) => Promise<Record<string, unknown>>;

/** Diseños que no se reemplazan por una animación (portada con imagen, demo de software, práctica, cierre). */
const KEEP_LAYOUTS = new Set(['cover', 'software_demo', 'practice_question', 'summary_checklist', 'conclusion_reflection']);
// Tres intentos: con la revisión visual hay un motivo más para corregir
const MAX_ATTEMPTS = 3;

const DIRECTOR_PROMPT = `Eres director de arte de videos educativos. Recibes las escenas de un video (título y narración)
y eliges cuáles se entienden MUCHO mejor con una animación hecha de ilustraciones, íconos, flechas y movimiento
que con una diapositiva de texto.
Elige escenas donde la narración describe algo que se puede MOSTRAR:
- movimiento o recorridos en un espacio (vehículos, personas, productos, rutas, flujos de un lugar a otro);
- partes de un objeto o de un sistema (cuerpo, máquina, organización) que se señalan una por una;
- causa y efecto o una secuencia física (esto pasa, entonces aquello);
- una cifra que crece o se acumula;
- lo correcto contra lo incorrecto (así sí / así no).
NO elijas escenas abstractas (definiciones, opiniones, reflexiones) ni escenas que sean una lista de ideas.
Escenario de cada una: "map" (SOLO tránsito: vista desde arriba con vías y vehículos), "diagram" (una pieza central con partes
señaladas), "versus" (dos paneles: incorrecto y correcto) o "canvas" (libre).
Evita elegir dos escenas seguidas. Si ninguna escena lo amerita, devuelve la lista vacía.
Responde SOLO JSON: {"scenes": [{"scene_order": 3, "scenario": "map", "idea": "qué se ve, en una frase"}]}`;

let catalog = '';

function specPrompt(): string {
  catalog ||= illustrationCatalogText();
  return `Eres animador de videos educativos. Conviertes la narración de UNA escena en un guion de animación JSON.
La animación ocupa la zona de contenido (bajo el título), dividida en una CUADRÍCULA de 12 columnas (A–L) por
6 filas (1–6). Cada pieza se ubica con "at": la celda de su centro, p. ej. "C4". Nunca uses píxeles.

FORMATO: {"scenario": "...", "panels": {...} (solo versus), "elements": [...], "beats": [...]}

ESCENARIOS:
- "canvas": libre.
- "map": vista desde ARRIBA. Vías con "road" y vehículos con "vehicle". Se conduce por la derecha (el carril se
  ajusta solo). Las vías van por una fila o columna completa (p. ej. path ["A4","L4"]) y los vehículos se ubican
  y se mueven SOBRE celdas de la vía. En una glorieta, un vehículo con "at" en la celda de la glorieta queda sobre su
  anillo (abajo si mira al E, a la derecha si mira al N, arriba si mira al W, a la izquierda si mira al S) y un "move"
  hacia la glorieta la recorre en curva en el sentido correcto. Dos vehículos nunca deben terminar en el mismo lugar.
- "diagram": una pieza central grande (xl) y textos cortos alrededor con "points_to" hacia ella.
- "versus": dos paneles: izquierdo columnas A–F, derecho G–L; la fila 1 es el encabezado (no pongas piezas ahí).
  Requiere "panels": {"left": {"title": "Así no", "tone": "incorrect"}, "right": {"title": "Así sí", "tone": "correct"}}
  (tone: correct | incorrect | neutral). "incorrect"/"correct" SOLO cuando la narración dice que una opción está MAL
  (conducta riesgosa, mito falso). Si compara dos opciones válidas (ABS y CBS, dos sistemas, dos tipos), los dos
  paneles van con "neutral" y su nombre como título (p. ej. "ABS" y "CBS"), sin marcas de correcto/incorrecto.

ELEMENTOS (todos con "id" único y "type"):
- illustration: {"asset": nombre en INGLÉS de la ilustración, "at", "size": s|m|l|xl, "label"?: máx. 28 caracteres}
- icon: {"asset": nombre de ícono Lucide (p. ej. "triangle-alert", "clock", "shield-check"), "at", "size", "color"?}
- vehicle (solo map): {"vehicle": car|bus|truck|motorcycle|bicycle, "at", "heading": N|E|S|W, "color"?, "label"?}
- sign: señal de tránsito oficial de Colombia {"sign": uno de ${Object.keys(SIGNS).join(', ')}, "value"?: km/h (solo
  velocidad-maxima), "at", "size", "label"?}. Para señales de tránsito usa SIEMPRE "sign", nunca ilustraciones ni
  íconos (y nunca una señal que no esté en la lista).
- text: {"text": máx. 90 caracteres, "at", "width": columnas 2–12, "style": title|body|caption, "points_to"?: id}
- number: {"value": número inicial, "prefix"?: "$", "suffix"?: " %", "decimals"?: 0–2, "at", "size", "label"?}
- zone: {"at": celda SUPERIOR IZQUIERDA, "span": [columnas, filas], "shape": box|circle, "color"?, "label"?}
- road (solo map): {"path": [celdas], "lanes": 1|2, "center"?: "dashed" (línea discontinua: se puede adelantar) |
  "solid" (línea continua amarilla: prohibido adelantar) | "double" (doble línea amarilla)}
- crosswalk (solo map): paso de cebra sobre una vía {"at": celda de la vía, "direction": "h" si la vía va de
  izquierda a derecha, "v" si va de arriba abajo}
- roundabout (solo map): {"at", "size": l|xl}
Colores: primary, secondary, success, danger, warning, neutral, blue, red, yellow, green, orange, white, gray, black.

ILUSTRACIONES DISPONIBLES (estilo plano). "asset" de una illustration debe ser EXACTAMENTE uno de estos nombres:
${catalog}
Si el concepto no tiene ilustración, usa un ícono Lucide o no pongas esa pieza. NUNCA uses la ilustración de otra
cosa con una etiqueta que diga lo que no es (p. ej. un banco con la etiqueta "Alcancía").

BEATS (entre 2 y 7, en el orden de la narración). Cada uno: {"cue": frase LITERAL de 3 a 8 palabras copiada de la
narración de esta escena, justo donde ocurre lo que se anima, "actions": [1 a 4 acciones que ocurren a la vez]}.
ACCIONES:
- {"do": "appear", "target": id}  (la pieza no se ve hasta este momento)
- {"do": "hide", "target": id}
- {"do": "move", "target": id, "to": celda, "via"?: [celdas intermedias para doblar], "seconds"?: 0.5–8}
- {"do": "highlight", "target": id}  (pulso para llamar la atención)
- {"do": "connect", "from": id, "to": id, "label"?: máx. 28 caracteres}  (flecha que se dibuja)
- {"do": "count", "target": id de un number, "to": número}
- {"do": "mark", "target": id, "as": "correct" | "incorrect"}
- {"do": "focus", "target": id, "zoom"?: 1.2–1.6} y {"do": "reset_focus"}  (acercar la cámara; úsalo poco)

TAMAÑO DE LAS PIEZAS (para que nada se tape): s ≈ 1 celda, m ≈ 1×1,5, l ≈ 2×2, xl ≈ 3×3. Deja al menos una celda
libre entre piezas. Una pieza con "label" necesita libre la mitad superior de la celda de abajo. Las piezas l y xl
no van en las filas 1 ni 6 ni en las columnas A ni L. Un text de width N ocupa N columnas.

REGLAS:
1. Muestra SOLO lo que dice la narración de esta escena, con sus datos exactos; nada inventado. Toda cifra en
   pantalla (textos, etiquetas, number, count) debe decirse en la narración de esta escena.
2. Pocas piezas, grandes y claras: entre 3 y 7 piezas visuales. La pieza principal en xl (o l); el resto l o m;
   s solo para detalles. Textos en español, cortos (máximo 3 textos). Usa el espacio: la escena no debe verse vacía.
   Vías ("road") y vehículos solo para tránsito; un proceso o una secuencia de pasos va en "canvas" con las piezas
   en fila (p. ej. columnas B, E, H, K de la fila 3) unidas con connect.
3. Lo que empieza visible arma el escenario (vías, pieza central); lo que la narración introduce después aparece con appear.
4. Cada cue debe aparecer tal cual en la narración y los cues van en el mismo orden que en ella.
Responde SOLO el JSON.`;
}

const norm = (t: string): string =>
  t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ%]+/g, ' ').trim();

/** Cues literales y en orden; lanza MotionSpecError con el detalle para la IA. */
function checkCues(raw: Record<string, unknown>, narration: string): void {
  const text = norm(narration);
  const beats = Array.isArray(raw.beats) ? (raw.beats as Array<Record<string, unknown>>) : [];
  let last = -1;
  beats.forEach((b, i) => {
    const cue = norm(typeof b?.cue === 'string' ? b.cue : '');
    const at = cue.length >= 3 ? text.indexOf(cue, Math.max(0, last)) : -1;
    if (at < 0) {
      const anywhere = cue.length >= 3 && text.includes(cue);
      throw new MotionSpecError(anywhere
        ? `beat ${i + 1}: el cue "${String(b.cue)}" está fuera de orden (los cues van en el orden de la narración)`
        : `beat ${i + 1}: el cue "${String(b?.cue)}" no aparece literalmente en la narración`);
    }
    last = at + cue.length;
  });
}

/** Números de un texto: "1.200.000" → 1200000, "4,5" → 4.5, "60 %" → 60. */
function numbersIn(text: string): number[] {
  return (text.match(/\d[\d.,]*/g) ?? []).map((raw) => {
    const t = raw.replace(/[.,]$/, '');
    // Punto o coma seguidos de 3 cifras son separadores de miles; si no, coma decimal
    const n = /^\d{1,3}([.,]\d{3})+$/.test(t) ? Number(t.replace(/[.,]/g, '')) : Number(t.replace(',', '.'));
    return n;
  }).filter((n) => Number.isFinite(n));
}

/** ¿La narración dice esta cifra (con números o con palabras)? */
function said(n: number, digits: Set<number>, words: string): boolean {
  if (digits.has(n)) return true;
  // Del 0 al 10 suelen ser pasos, puestos o cantidades obvias ("Paso 2")
  if (Number.isInteger(n) && n >= 0 && n <= 10) return true;
  if (!Number.isInteger(n) || n < 0) return false;
  const inWords = (x: number): boolean => x < 1_000_000 && ` ${words} `.includes(` ${numberToSpanish(x)} `);
  if (n < 1_000_000) return inWords(n);
  // Millones: "un millón doscientos mil", "un millón 200000", "3 millones"
  const m = Math.floor(n / 1_000_000);
  const r = n % 1_000_000;
  const hasMillion = /\bmillon(es)?\b/.test(words);
  const millionsOk = m === 1 ? /\bun millon\b/.test(words) : digits.has(m) || inWords(m);
  return hasMillion && millionsOk && (r === 0 || digits.has(r) || inWords(r));
}

/** Toda cifra en pantalla debe decirla la narración de la escena: la animación no inventa datos. */
export function checkNumbers(spec: MotionSpec, narration: string): void {
  const digits = new Set(numbersIn(narration));
  const words = norm(narration);
  const shown: Array<[number, string]> = [];
  for (const el of spec.elements) {
    if (el.type === 'number') {
      if (el.value !== 0) shown.push([el.value, el.id]);
    }
    // El límite de velocidad de una señal también es una cifra que debe decir la narración
    if (el.type === 'sign' && el.value != null) shown.push([el.value, el.id]);
    const texts = [el.type === 'text' ? el.text : '', el.label ?? ''];
    for (const t of texts) for (const n of numbersIn(t)) shown.push([n, el.id]);
  }
  for (const b of spec.beats) {
    for (const a of b.actions) {
      if (a.do === 'count') shown.push([a.to, a.target]);
      if (a.do === 'connect' && a.label) for (const n of numbersIn(a.label)) shown.push([n, `${a.from}→${a.to}`]);
    }
  }
  const wrong = shown.filter(([n]) => !said(n, digits, words));
  if (wrong.length) {
    throw new MotionSpecError(wrong.map(([n, id]) => `la cifra ${n.toLocaleString('es-CO')} de "${id}" no aparece en la narración`).join('; ') +
      ': usa solo cifras que se dicen en esta escena');
  }
}

/** Revisión visual: (imagen JPEG en base64, instrucciones) → {ok, problems}. */
export type VisionCall = (jpegBase64: string, prompt: string) => Promise<Record<string, unknown>>;

const VISION_PROMPT = `Revisas el último cuadro de una escena animada de un video educativo. Las ilustraciones son de
estilo emoji (simples, no realistas) y los íconos son símbolos: un corazón estilizado vale para "latido", un reloj
para "tiempo". Sé tolerante con eso.
Marca como problema SOLO lo que claramente confundiría al estudiante:
- una pieza que muestra algo DISTINTO u OPUESTO a su etiqueta (un escudo de seguridad como "Riesgo", una persona CON
  casco etiquetada "Sin casco", un banco como "Alcancía");
- texto encimado con otra pieza o cortado por el borde;
- una comparación que presenta como incorrecta ("Así no", marca roja) una opción que la narración considera válida.
NO reportes ortografía, estilo, colores, posiciones aproximadas ni detalles que falten. Las señales de tránsito
de la lista son las oficiales de Colombia dibujadas con símbolos simplificados: no las reportes por su dibujo.
Responde SOLO JSON: {"ok": true|false, "problems": ["problema concreto, en una frase", ...]}.
Si nada de eso ocurre: {"ok": true, "problems": []}.`;

function describePieces(spec: MotionSpec): string {
  return spec.elements.map((e) => {
    switch (e.type) {
      case 'illustration':
      case 'icon':
        return `- "${e.id}": ${e.type === 'icon' ? 'ícono' : 'ilustración'} de "${e.asset.name}"${e.label ? ` con etiqueta "${e.label}"` : ''}`;
      case 'vehicle':
        return `- "${e.id}": vehículo (${e.vehicle}) visto desde arriba${e.label ? ` con etiqueta "${e.label}"` : ''}`;
      case 'sign':
        return `- "${e.id}": señal de tránsito oficial "${SIGNS[e.sign]?.name ?? e.sign}"${e.value ? ` (${e.value} km/h)` : ''}${e.label ? ` con etiqueta "${e.label}"` : ''}`;
      case 'text':
        return `- "${e.id}": texto "${e.text}"`;
      case 'number':
        return `- "${e.id}": cifra${e.label ? ` con etiqueta "${e.label}"` : ''}`;
      default:
        return `- "${e.id}": ${e.type}`;
    }
  }).join('\n');
}

export interface DirectorOptions {
  jobId: string;
  maxScenes: number;
  call: JsonCall;
  classifierModel: string;
  logger: Logger;
  /** Para pruebas: revisión de distribución alternativa (por defecto, un navegador propio). */
  preview?: Pick<MotionPreview, 'check' | 'close'>;
  /** Revisión visual del último cuadro con un modelo de visión; sin ella solo se revisa la distribución. */
  vision?: VisionCall;
}

/** Convierte hasta maxScenes escenas en escenas animadas. Devuelve cuántas quedaron animadas. */
export async function directMotionScenes(script: GeneratedScript, opts: DirectorOptions): Promise<number> {
  const { jobId, logger } = opts;
  const candidates = script.scenes.filter((s) => !KEEP_LAYOUTS.has(s.layout_type) && (s.narration ?? '').split(/\s+/).length >= 25);
  if (opts.maxScenes <= 0 || candidates.length === 0) return 0;

  let picks: Array<{ scene: GeneratedScene; scenario: string; idea: string }> = [];
  try {
    const raw = await opts.call([
      { role: 'system', content: DIRECTOR_PROMPT },
      { role: 'user', content: `Máximo ${opts.maxScenes} escenas.\n\n` + candidates.map((s) =>
        `ESCENA ${s.scene_order} — ${s.title}\n${s.narration}`).join('\n\n') },
    ], 'motion_director', opts.classifierModel);
    const chosen = Array.isArray(raw.scenes) ? (raw.scenes as Array<Record<string, unknown>>) : [];
    const byOrder = new Map(candidates.map((s) => [s.scene_order, s]));
    picks = chosen
      .map((c) => ({ scene: byOrder.get(Number(c.scene_order))!, scenario: String(c.scenario ?? 'canvas'), idea: String(c.idea ?? '') }))
      .filter((p) => p.scene)
      .slice(0, opts.maxScenes);
  } catch (err: unknown) {
    logger.warn(`[MotionDirector] [${jobId}] Elección de escenas omitida: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
  if (picks.length === 0) {
    logger.log(`[MotionDirector] [${jobId}] Ninguna escena amerita animación`);
    return 0;
  }

  const preview = opts.preview ?? new MotionPreview();
  let animated = 0;
  try {
    for (const { scene, scenario, idea } of picks) {
      let feedback = '';
      let lastRaw = '';
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const raw = await opts.call([
            { role: 'system', content: specPrompt() },
            { role: 'user', content: `TÍTULO DE LA ESCENA: ${scene.title}\nESCENARIO SUGERIDO: ${scenario}\nIDEA: ${idea}\n` +
              `NARRACIÓN:\n${scene.narration}${feedback}` },
          ], 'motion_spec');
          lastRaw = JSON.stringify(raw);
          checkCues(raw, scene.narration ?? '');
          const { spec, moved } = prepareMotionSpec(raw);
          checkNumbers(spec, scene.narration ?? '');
          if (moved.length) logger.log(`[MotionDirector] [${jobId}] Escena ${scene.scene_order}: acomodadas ${moved.join(', ')}`);
          const { issues, snapshot } = await preview.check(spec, scene.title ?? '', scene.estimated_duration_seconds || 20);
          if (issues.length) {
            throw new MotionSpecError(issues.map((i) => `beat ${i.beat}: ${i.message}`).join('; '));
          }
          if (opts.vision) {
            const verdict = await opts.vision(snapshot, `${VISION_PROMPT}\n\nTÍTULO: ${scene.title}\nNARRACIÓN: ${scene.narration}\nPIEZAS:\n${describePieces(spec)}`)
              .catch((err: unknown) => {
                // Si la revisión visual falla (API), se acepta la escena: ya pasó las demás revisiones
                logger.warn(`[MotionDirector] [${jobId}] Revisión visual omitida: ${err instanceof Error ? err.message : String(err)}`);
                return { ok: true } as Record<string, unknown>;
              });
            const problems = Array.isArray(verdict.problems) ? verdict.problems.map(String).filter(Boolean) : [];
            if (verdict.ok === false && problems.length) {
              throw new MotionSpecError(`revisión visual: ${problems.join('; ')}`);
            }
          }
          scene.motion_spec = { ...raw, fallback_layout: scene.layout_type };
          scene.layout_type = 'motion_scene';
          scene.requires_ai_image = false;
          scene.image_prompt = null;
          animated++;
          logger.log(`[MotionDirector] [${jobId}] Escena ${scene.scene_order} animada (${spec.scenario}, ${spec.elements.length} piezas, ${spec.beats.length} beats)`);
          break;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`[MotionDirector] [${jobId}] Escena ${scene.scene_order} intento ${attempt}: ${msg}`);
          // Errores de la API no se corrigen con explicaciones: la escena queda como estaba
          if (!(err instanceof MotionSpecError) && !(err instanceof SyntaxError)) break;
          // La IA ve su intento anterior y el problema: corrige eso en vez de empezar de cero
          feedback = `\n\nTU INTENTO ANTERIOR:\n${lastRaw.slice(0, 6000)}\n\nNO ERA VÁLIDO: ${msg}.\n` +
            'Corrige SOLO esos problemas (mueve, agranda, cambia o quita la pieza que falla) y devuelve el JSON completo.';
        }
      }
    }
  } finally {
    await preview.close();
  }
  return animated;
}
