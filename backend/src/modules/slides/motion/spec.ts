import { AssetMatch, findAsset, suggestAssets } from './assets';

// Guion de animación de una escena (layout motion_scene). La IA lo escribe en JSON; aquí se valida
// y se normaliza. Cualquier problema lanza MotionSpecError con un mensaje pensado para devolverlo
// a la IA ("corrige esto"); si tampoco se logra, la escena cae a una diapositiva normal.
//
// Las piezas se ubican en una cuadrícula de 12 columnas (A–L) por 6 filas (1–6) que cubre la zona
// de contenido; la IA nunca escribe píxeles. Cada "beat" se dispara con una frase literal de la
// narración y ejecuta sus acciones a la vez.

export class MotionSpecError extends Error {}

export const GRID_COLS = 12;
export const GRID_ROWS = 6;
export const SCENARIOS = ['canvas', 'map', 'diagram', 'versus'] as const;
export const ELEMENT_TYPES = ['illustration', 'icon', 'vehicle', 'text', 'number', 'zone', 'road', 'roundabout'] as const;
export const ACTIONS = ['appear', 'hide', 'move', 'highlight', 'connect', 'count', 'mark', 'focus', 'reset_focus'] as const;
export const SIZES = ['s', 'm', 'l', 'xl'] as const;
export const COLORS = [
  'primary', 'secondary', 'success', 'danger', 'warning', 'neutral',
  'blue', 'red', 'yellow', 'green', 'orange', 'white', 'gray', 'black',
] as const;
export const VEHICLES = ['car', 'bus', 'truck', 'motorcycle', 'bicycle'] as const;
export const HEADINGS = ['N', 'E', 'S', 'W'] as const;
export const TONES = ['correct', 'incorrect', 'neutral'] as const;

const MAX_ELEMENTS = 16;
const MAX_BEATS = 8;
const MAX_ACTIONS_PER_BEAT = 5;

export type Scenario = typeof SCENARIOS[number];
export type Size = typeof SIZES[number];
export type ColorToken = typeof COLORS[number];

export interface Cell { col: number; row: number }

interface BaseElement { id: string; label: string | null; color: ColorToken | null }

export type MotionElement =
  | BaseElement & { type: 'illustration' | 'icon'; asset: AssetMatch; at: Cell; size: Size; faces: 'left' | 'right' }
  | BaseElement & { type: 'vehicle'; vehicle: typeof VEHICLES[number]; at: Cell; size: Size; heading: typeof HEADINGS[number] }
  | BaseElement & { type: 'text'; text: string; at: Cell; width: number; style: 'title' | 'body' | 'caption'; pointsTo: string | null }
  | BaseElement & { type: 'number'; value: number; prefix: string; suffix: string; decimals: number; at: Cell; size: Size; counts: number[] }
  | BaseElement & { type: 'zone'; at: Cell; span: [number, number]; shape: 'box' | 'circle' }
  | BaseElement & { type: 'road'; path: Cell[]; lanes: 1 | 2 }
  | BaseElement & { type: 'roundabout'; at: Cell; size: Size };

export type MotionAction =
  | { do: 'appear' | 'hide' | 'highlight'; target: string }
  | { do: 'move'; target: string; to: Cell; via: Cell[]; seconds: number | null }
  | { do: 'connect'; from: string; to: string; label: string | null }
  | { do: 'count'; target: string; to: number }
  | { do: 'mark'; target: string; as: 'correct' | 'incorrect' }
  | { do: 'focus'; target: string | null; at: Cell | null; zoom: number }
  | { do: 'reset_focus' };

export interface MotionBeat { cue: string; actions: MotionAction[] }

export interface MotionSpec {
  scenario: Scenario;
  panels: { left: { title: string; tone: typeof TONES[number] }; right: { title: string; tone: typeof TONES[number] } } | null;
  elements: MotionElement[];
  beats: MotionBeat[];
}

const str = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '').slice(0, max);

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return options.find((o) => o.toLowerCase() === s) ?? fallback;
}

function strictOneOf<T extends string>(v: unknown, options: readonly T[], what: string): T {
  const s = typeof v === 'string' ? v.trim() : '';
  const hit = options.find((o) => o.toLowerCase() === s.toLowerCase());
  if (!hit) throw new MotionSpecError(`${what} inválido: "${String(v)}" (opciones: ${options.join(', ')})`);
  return hit;
}

export function parseCell(v: unknown, what: string): Cell {
  const m = /^([A-La-l])\s*([1-6])$/.exec(str(v, 4));
  if (!m) throw new MotionSpecError(`${what}: celda inválida "${String(v)}" (usa columna A–L y fila 1–6, p. ej. "C4")`);
  return { col: m[1]!.toUpperCase().charCodeAt(0) - 65, row: Number(m[2]) - 1 };
}

export const cellName = (c: Cell): string => `${String.fromCharCode(65 + c.col)}${c.row + 1}`;

function num(v: unknown, what: string): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : NaN;
  if (!Number.isFinite(n)) throw new MotionSpecError(`${what}: número inválido "${String(v)}"`);
  return n;
}

function parseElement(raw: Record<string, unknown>, index: number): MotionElement {
  const id = str(raw.id, 30);
  if (!/^[a-zA-Z][\w-]*$/.test(id)) throw new MotionSpecError(`elemento ${index + 1}: id inválido "${String(raw.id)}" (letras, números, guion)`);
  const type = strictOneOf(raw.type, ELEMENT_TYPES, `elemento "${id}": type`);
  const base: BaseElement = {
    id,
    label: str(raw.label, 40) || null,
    color: raw.color == null ? null : oneOf(raw.color, COLORS, 'primary'),
  };
  if (base.label && base.label.length > 28) throw new MotionSpecError(`elemento "${id}": label demasiado largo (máx. 28 caracteres)`);
  const at = (): Cell => parseCell(raw.at, `elemento "${id}"`);
  const size = (): Size => oneOf(raw.size, SIZES, 'm');

  switch (type) {
    case 'illustration':
    case 'icon': {
      const asked = str(raw.asset, 60);
      if (!asked) throw new MotionSpecError(`elemento "${id}": falta asset`);
      // Si no hay ilustración, un ícono del mismo concepto (y al revés) antes que rechazar la escena
      const other = type === 'icon' ? 'illustration' : 'icon';
      const found = findAsset(type, asked) ?? findAsset(other, asked);
      const asset = found;
      if (found && found.kind !== type) {
        return found.kind === 'icon'
          ? { ...base, type: 'icon', asset: found, at: at(), size: size(), faces: 'left' }
          : { ...base, type: 'illustration', asset: found, at: at(), size: size(), faces: 'left' };
      }
      if (!asset) {
        const near = suggestAssets(type, asked);
        throw new MotionSpecError(`elemento "${id}": no existe ${type === 'icon' ? 'el ícono' : 'la ilustración'} "${asked}"` +
          (near.length ? ` (parecidos: ${near.join(', ')})` : ' (usa un concepto más simple en inglés)'));
      }
      return { ...base, type, asset, at: at(), size: size(), faces: oneOf(raw.faces, ['left', 'right'] as const, 'left') };
    }
    case 'vehicle':
      return {
        ...base, type, at: at(), size: size(),
        vehicle: strictOneOf(raw.vehicle, VEHICLES, `elemento "${id}": vehicle`),
        heading: oneOf(raw.heading, HEADINGS, 'E'),
      };
    case 'text': {
      const text = str(raw.text, 200);
      if (!text) throw new MotionSpecError(`elemento "${id}": texto vacío`);
      if (text.length > 90) throw new MotionSpecError(`elemento "${id}": texto demasiado largo (${text.length} caracteres, máx. 90)`);
      const width = Math.round(num(raw.width ?? 4, `elemento "${id}": width`));
      if (width < 2 || width > 12) throw new MotionSpecError(`elemento "${id}": width debe estar entre 2 y 12 columnas`);
      return {
        ...base, type, text, at: at(), width,
        style: oneOf(raw.style, ['title', 'body', 'caption'] as const, 'body'),
        pointsTo: str(raw.points_to, 30) || null,
      };
    }
    case 'number': {
      const decimals = Math.max(0, Math.min(2, Math.round(Number(raw.decimals ?? 0)) || 0));
      return {
        ...base, type, at: at(), size: size(), decimals, counts: [],
        value: num(raw.value ?? 0, `elemento "${id}": value`),
        // Sin recortar espacios: " lpm" debe verse separado del número
        prefix: typeof raw.prefix === 'string' ? raw.prefix.slice(0, 6) : '',
        suffix: typeof raw.suffix === 'string' ? raw.suffix.slice(0, 12) : '',
      };
    }
    case 'zone': {
      const span = Array.isArray(raw.span) ? raw.span : [2, 2];
      const cols = Math.round(num(span[0], `elemento "${id}": span`));
      const rows = Math.round(num(span[1], `elemento "${id}": span`));
      if (cols < 1 || rows < 1 || cols > GRID_COLS || rows > GRID_ROWS) throw new MotionSpecError(`elemento "${id}": span fuera de rango`);
      return { ...base, type, at: at(), span: [cols, rows], shape: oneOf(raw.shape, ['box', 'circle'] as const, 'box') };
    }
    case 'road': {
      const cells = Array.isArray(raw.path) ? raw.path.map((c, i) => parseCell(c, `vía "${id}" punto ${i + 1}`)) : [];
      if (cells.length < 2) throw new MotionSpecError(`vía "${id}": path necesita al menos 2 celdas`);
      return { ...base, type, path: cells, lanes: Number(raw.lanes) === 1 ? 1 : 2 };
    }
    case 'roundabout':
      return { ...base, type, at: at(), size: oneOf(raw.size, SIZES, 'l') };
  }
}

function parseAction(raw: Record<string, unknown>, where: string, ids: Map<string, MotionElement>): MotionAction {
  const kind = strictOneOf(raw.do, ACTIONS, `${where}: do`);
  const target = (field = 'target'): string => {
    const id = str(raw[field], 30);
    if (!ids.has(id)) throw new MotionSpecError(`${where}: ${field} "${id}" no es el id de ningún elemento`);
    return id;
  };
  switch (kind) {
    case 'appear':
    case 'hide':
    case 'highlight':
      return { do: kind, target: target() };
    case 'move': {
      const id = target();
      const el = ids.get(id)!;
      if (!['illustration', 'icon', 'vehicle', 'number', 'text'].includes(el.type)) {
        throw new MotionSpecError(`${where}: no se puede mover "${id}" (${el.type})`);
      }
      const via = Array.isArray(raw.via) ? raw.via.map((c, i) => parseCell(c, `${where} via ${i + 1}`)) : [];
      if (via.length > 6) throw new MotionSpecError(`${where}: via admite máximo 6 celdas`);
      const seconds = raw.seconds == null ? null : Math.max(0.5, Math.min(8, num(raw.seconds, `${where}: seconds`)));
      return { do: 'move', target: id, to: parseCell(raw.to, `${where} to`), via, seconds };
    }
    case 'connect': {
      const from = target('from');
      const to = target('to');
      if (from === to) throw new MotionSpecError(`${where}: connect necesita dos elementos distintos`);
      const label = str(raw.label, 40) || null;
      if (label && label.length > 28) throw new MotionSpecError(`${where}: label de connect demasiado largo (máx. 28)`);
      return { do: 'connect', from, to, label };
    }
    case 'count': {
      const id = target();
      if (ids.get(id)!.type !== 'number') throw new MotionSpecError(`${where}: count solo aplica a elementos number ("${id}" no lo es)`);
      return { do: 'count', target: id, to: num(raw.to, `${where}: to`) };
    }
    case 'mark':
      return { do: 'mark', target: target(), as: strictOneOf(raw.as, ['correct', 'incorrect'] as const, `${where}: as`) };
    case 'focus': {
      // Más de 1,6 deja fuera de cuadro casi todo lo demás
      const zoom = Math.max(1.2, Math.min(1.6, raw.zoom == null ? 1.4 : num(raw.zoom, `${where}: zoom`)));
      if (raw.target != null && raw.target !== '') return { do: 'focus', target: target(), at: null, zoom };
      return { do: 'focus', target: null, at: parseCell(raw.at, `${where} focus`), zoom };
    }
    case 'reset_focus':
      return { do: 'reset_focus' };
  }
}

export function resolveMotionSpec(raw: unknown): MotionSpec {
  const spec = (raw ?? {}) as Record<string, unknown>;
  const requestedScenario = strictOneOf(spec.scenario ?? 'canvas', SCENARIOS, 'scenario');

  const rawElements = Array.isArray(spec.elements) ? (spec.elements as Array<Record<string, unknown>>) : [];
  if (rawElements.length === 0) throw new MotionSpecError('la escena no tiene elementos');
  if (rawElements.length > MAX_ELEMENTS) throw new MotionSpecError(`demasiados elementos (${rawElements.length}, máx. ${MAX_ELEMENTS})`);
  const elements = rawElements.map((e, i) => parseElement(e ?? {}, i));
  const ids = new Map<string, MotionElement>();
  for (const el of elements) {
    if (ids.has(el.id)) throw new MotionSpecError(`id repetido: "${el.id}"`);
    ids.set(el.id, el);
  }

  // Con vehículos, la escena es un mapa visto desde arriba aunque la IA haya puesto otro escenario.
  // Las vías sin vehículos no explican nada (la IA las usaba como "línea de pasos")
  let scenario = requestedScenario;
  const hasVehicles = elements.some((e) => e.type === 'vehicle');
  if (scenario !== 'versus' && hasVehicles) scenario = 'map';
  if (!hasVehicles && elements.some((e) => e.type === 'road' || e.type === 'roundabout')) {
    throw new MotionSpecError('las vías y glorietas solo se usan en escenas de tránsito con vehículos; para pasos o procesos usa "canvas" con piezas en fila y connect');
  }

  for (const el of elements) {
    if (el.type === 'text' && el.pointsTo && !ids.has(el.pointsTo)) {
      throw new MotionSpecError(`texto "${el.id}": points_to "${el.pointsTo}" no es el id de ningún elemento`);
    }
    if ((el.type === 'vehicle' || el.type === 'road' || el.type === 'roundabout') && scenario !== 'map') {
      throw new MotionSpecError(`"${el.id}" (${el.type}) solo se usa con scenario "map"`);
    }
    if (scenario === 'versus' && 'at' in el && el.at.row === 0) {
      throw new MotionSpecError(`"${el.id}": en "versus" la fila 1 es el encabezado de los paneles; usa filas 2–6`);
    }
  }

  let panels: MotionSpec['panels'] = null;
  if (scenario === 'versus') {
    const p = (spec.panels ?? {}) as Record<string, Record<string, unknown> | undefined>;
    const side = (s: 'left' | 'right') => {
      const title = str(p[s]?.title, 40);
      if (!title) throw new MotionSpecError(`versus: falta panels.${s}.title`);
      if (title.length > 30) throw new MotionSpecError(`versus: panels.${s}.title demasiado largo (máx. 30)`);
      return { title, tone: oneOf(p[s]?.tone, TONES, 'neutral') };
    };
    panels = { left: side('left'), right: side('right') };
  }

  const rawBeats = Array.isArray(spec.beats) ? (spec.beats as Array<Record<string, unknown>>) : [];
  if (rawBeats.length < 2 || rawBeats.length > MAX_BEATS) {
    throw new MotionSpecError(`la escena necesita entre 2 y ${MAX_BEATS} beats (tiene ${rawBeats.length})`);
  }
  const beats = rawBeats.map((b, i) => {
    const where = `beat ${i + 1}`;
    const cue = str(b?.cue, 160);
    if (!cue) throw new MotionSpecError(`${where}: falta cue (frase literal de la narración)`);
    const acts = Array.isArray(b?.actions) ? (b.actions as Array<Record<string, unknown>>) : [];
    if (acts.length === 0 || acts.length > MAX_ACTIONS_PER_BEAT) {
      throw new MotionSpecError(`${where}: necesita entre 1 y ${MAX_ACTIONS_PER_BEAT} acciones`);
    }
    return { cue, actions: acts.map((a, j) => parseAction(a ?? {}, `${where} acción ${j + 1}`, ids)) };
  });

  // Valores a los que cuenta cada número (para reservarle el ancho del más largo)
  for (const b of beats) {
    for (const a of b.actions) {
      if (a.do === 'count') (ids.get(a.target) as Extract<MotionElement, { type: 'number' }>).counts.push(a.to);
    }
  }

  // Escena con piezas diminutas: se ve vacía y no se lee en un celular
  const visual = elements.filter((e) => e.type === 'illustration' || e.type === 'icon' || e.type === 'vehicle');
  // (En un mapa las vías llenan la escena y los vehículos van a escala de la vía)
  if (scenario !== 'map' && visual.length && !visual.some((e) => 'size' in e && (e.size === 'l' || e.size === 'xl'))) {
    throw new MotionSpecError('todas las piezas son pequeñas: la pieza principal de la escena debe ser de tamaño l o xl');
  }

  // Un texto con flecha a su objeto no sigue al objeto si este se mueve
  const moved = new Set(beats.flatMap((b) => b.actions.filter((a) => a.do === 'move').map((a) => (a as { target: string }).target)));
  for (const el of elements) {
    if (el.type === 'text' && el.pointsTo && moved.has(el.pointsTo)) {
      throw new MotionSpecError(`texto "${el.id}" señala a "${el.pointsTo}", que se mueve; señala algo fijo o quita points_to`);
    }
  }

  return { scenario, panels, elements, beats };
}

/** Elementos que no están en pantalla al empezar (su primera acción es appear). */
export function initiallyHidden(spec: MotionSpec): Set<string> {
  const seen = new Set<string>();
  const hidden = new Set<string>();
  for (const beat of spec.beats) {
    for (const a of beat.actions) {
      const ids = a.do === 'connect' ? [a.from, a.to] : 'target' in a && a.target ? [a.target] : [];
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        if (a.do === 'appear') hidden.add(id);
      }
    }
  }
  return hidden;
}
