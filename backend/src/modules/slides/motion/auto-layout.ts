import { Cell, GRID_COLS, GRID_ROWS, MotionElement, MotionSpec, resolveMotionSpec } from './spec';
import { CELL_H, CELL_W, STAGE_H, STAGE_W, geometry } from './motion.template';

// Acomodador: la IA ubica bien las ideas pero calcula mal el espacio (piezas encimadas o fuera del
// escenario). Antes de revisar la escena en el navegador, se mueve cada pieza fija que estorba a la
// celda libre más cercana y se meten en el escenario las que se salen. Los vehículos, las vías y lo
// que se desplaza conservan su lugar (su posición es parte de lo que se explica); solo se ajustan si
// se salen del escenario.

interface Box { l: number; t: number; r: number; b: number }

/** Píxeles que una pieza puede acercarse al borde (negativo: puede asomarse un poco, como en la revisión final). */
const MARGIN = -4;
/** Parte del área de la pieza más chica que puede quedar tapada (más estricto que la revisión final). */
const MAX_OVERLAP = 0.08;
const LABEL_H = 52;

type Placed = Extract<MotionElement, { at: Cell }>;

/** Tamaños menores a probar, de mayor a menor (la pieza central nunca baja de m). */
const SMALLER: Record<string, Array<'l' | 'm'>> = { xl: ['l', 'm'], l: ['m'], m: [], s: [] };

function hasAt(el: MotionElement): el is Placed {
  return 'at' in el;
}

/** Cajas de la pieza (cuerpo y, si tiene, etiqueta) si su centro estuviera en la celda dada. */
function boxAt(el: Placed, cell: Cell): Box[] | null {
  const g = geometry({ ...el, at: cell } as MotionElement);
  if (!g) return null;
  // Un vehículo puede girar: se reserva el cuadrado de su largo
  const w = el.type === 'vehicle' ? Math.max(g.w, g.h) : g.w;
  const h = el.type === 'vehicle' ? Math.max(g.w, g.h) : g.h;
  const body = { l: g.x - w / 2, t: g.y - h / 2, r: g.x + w / 2, b: g.y + h / 2 };
  if (!('label' in el) || !el.label) return [body];
  const lw = el.label.length * 15 + 40;
  return [body, { l: g.x - lw / 2, t: body.b + 8, r: g.x + lw / 2, b: body.b + 8 + LABEL_H }];
}

const inside = (parts: Box[], versus = false): boolean =>
  parts.every((b) => b.l >= MARGIN && b.t >= MARGIN && b.r <= STAGE_W - MARGIN && b.b <= STAGE_H - MARGIN &&
    // En versus cada pieza queda dentro de su panel (no cruza la línea del medio)
    (!versus || b.r <= STAGE_W / 2 - 14 || b.l >= STAGE_W / 2 + 14));

function overlapArea(a: Box, b: Box): number {
  return Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
}

/** Cada parte se compara con su propia área: una etiqueta chica se considera tapada antes que una pieza grande. */
function collides(parts: Box[], others: Box[]): boolean {
  const area = (x: Box): number => (x.r - x.l) * (x.b - x.t);
  return parts.some((b) => others.some((o) => overlapArea(b, o) > MAX_OVERLAP * Math.min(area(b), area(o))));
}

/** Celdas permitidas para una pieza según el escenario (en versus, su propio panel y sin el encabezado). */
function allowedCells(spec: MotionSpec, original: Cell): Cell[] {
  const cells: Cell[] = [];
  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      if (spec.scenario === 'versus' && (row === 0 || (col < 6) !== (original.col < 6))) continue;
      cells.push({ col, row });
    }
  }
  // Las más cercanas primero; a igual distancia, la misma fila (se lee mejor)
  const dist = (c: Cell): number => Math.hypot((c.col - original.col) * CELL_W, (c.row - original.row) * CELL_H * 1.15);
  return cells.sort((a, b) => dist(a) - dist(b));
}

/** Primera celda donde la pieza cabe en el escenario y no tapa nada; null si no hay. */
function findCell(spec: MotionSpec, el: Placed, original: Cell, occupied: Box[], needFree: boolean): Cell | null {
  for (const cell of allowedCells(spec, original)) {
    const b = boxAt(el, cell);
    if (b && inside(b, spec.scenario === 'versus') && (!needFree || !collides(b, occupied))) return cell;
  }
  return null;
}

/** Ajusta el guion en el lugar; devuelve los ids de las piezas movidas. */
export function autoLayout(spec: MotionSpec): string[] {
  const moved = new Set<string>();
  const movers = new Set<string>();
  const moveActions = spec.beats.flatMap((b) => b.actions.filter((a) => a.do === 'move')) as Array<{ target: string; to: Cell; via: Cell[] }>;
  for (const a of moveActions) movers.add(a.target);
  const byId = new Map(spec.elements.map((e) => [e.id, e]));

  // 1. Lo que se sale del escenario entra a la celda más cercana donde cabe
  for (const el of spec.elements) {
    if (!hasAt(el) || el.type === 'zone' || el.type === 'roundabout' || el.type === 'crosswalk') continue;
    const b = boxAt(el, el.at);
    if (b && !inside(b, spec.scenario === 'versus')) {
      const cell = findCell(spec, el, el.at, [], false);
      if (cell) { el.at = cell; moved.add(el.id); }
    }
  }
  for (const a of moveActions) {
    const el = byId.get(a.target);
    if (!el || !hasAt(el)) continue;
    const b = boxAt(el, a.to);
    if (b && !inside(b, spec.scenario === 'versus')) {
      const cell = findCell(spec, el, a.to, [], false);
      if (cell) { a.to = cell; moved.add(el.id); }
    }
  }

  // 2. Lo que se mueve y los vehículos conservan su lugar: ocupan todas sus posiciones de reposo
  const occupied: Box[] = [];
  for (const el of spec.elements) {
    if (!hasAt(el) || el.type === 'zone' || el.type === 'roundabout' || el.type === 'crosswalk') continue;
    if (!movers.has(el.id) && el.type !== 'vehicle') continue;
    // Un destino tras el que la pieza desaparece (la moneda entra a la alcancía) no ocupa lugar
    const rests = [el.at, ...spec.beats.flatMap((beat, i) => beat.actions
      .filter((a): a is Extract<typeof a, { do: 'move' }> => a.do === 'move' && a.target === el.id)
      .filter(() => ![beat, spec.beats[i + 1]].some((b) => b?.actions.some((x) => x.do === 'hide' && x.target === el.id)))
      .map((a) => a.to))];
    for (const cell of rests) {
      const b = boxAt(el, cell);
      if (b) occupied.push(...b);
    }
  }

  // 3. Piezas fijas, las más grandes primero (la pieza central no se mueve; lo chico se acomoda alrededor)
  const fixed = spec.elements.filter((e): e is Placed =>
    hasAt(e) && !movers.has(e.id) && e.type !== 'vehicle' && e.type !== 'zone' && e.type !== 'roundabout' && e.type !== 'crosswalk');
  const areaOf = (e: Placed): number => { const b = boxAt(e, e.at)?.[0]; return b ? (b.r - b.l) * (b.b - b.t) : 0; };
  const order = [...fixed].sort((a, b) => Number(a.type === 'text') - Number(b.type === 'text') || areaOf(b) - areaOf(a));
  for (const el of order) {
    const b = boxAt(el, el.at);
    if (!b) continue;
    if (collides(b, occupied)) {
      // Sin celda libre a su tamaño, se prueba más angosto (texto) o más pequeño (pieza)
      const shrinks = el.type === 'text'
        ? Array.from({ length: Math.max(0, el.width - 2) }, (_, i) => ({ width: el.width - i - 1 }))
        : 'size' in el ? SMALLER[el.size].map((size) => ({ size })) : [];
      let cell = findCell(spec, el, el.at, occupied, true);
      for (const change of shrinks) {
        if (cell) break;
        const trial = { ...el, ...change } as Placed;
        cell = findCell(spec, trial, el.at, occupied, true);
        if (cell) Object.assign(el, change);
      }
      if (cell) { el.at = cell; moved.add(el.id); }
    }
    const placed = boxAt(el, el.at);
    if (placed) occupied.push(...placed);
  }
  return [...moved];
}

/**
 * Guion listo para dibujar: validado y acomodado. Es determinista, así que el director (al revisar)
 * y SlidesService (al dibujar) obtienen exactamente la misma escena a partir del mismo JSON.
 */
export function prepareMotionSpec(raw: unknown): { spec: MotionSpec; moved: string[] } {
  const spec = resolveMotionSpec(raw);
  return { spec, moved: autoLayout(spec) };
}
