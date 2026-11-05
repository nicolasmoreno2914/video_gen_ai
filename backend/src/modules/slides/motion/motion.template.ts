import { SlideTemplateData } from '../slides.service';
import { eyebrow } from '../templates/diagrams.template';
import { alpha, editorialPage } from '../templates/editorial';
import { escape } from '../templates/shared';
import { assetSvg } from './assets';
import { Cell, ColorToken, GRID_COLS, GRID_ROWS, MotionElement, MotionSpec, Size, initiallyHidden } from './spec';

// Escena animada (layout motion_scene): dibuja el guion de animación ya validado y calcula, en
// Node, todas las pistas de animación (posición, giro, opacidad, trazo, contador, cámara).
// El runtime del navegador solo interpola esas pistas: seek(t) fija el estado exacto de cualquier
// instante y motionWindows() dice dónde hay movimiento, igual que el resto de slides animados.

/** Zona de contenido (dentro de .stage, con los márgenes laterales de siempre). */
export const STAGE_W = 1700;
export const STAGE_H = 680;
export const CELL_W = STAGE_W / GRID_COLS;
export const CELL_H = STAGE_H / GRID_ROWS;

const BOX: Record<Size, number> = { s: 110, m: 170, l: 260, xl: 380 };
const NUMBER_FONT: Record<Size, number> = { s: 64, m: 96, l: 140, xl: 180 };
const VEHICLE_LEN: Record<Size, number> = { s: 90, m: 130, l: 180, xl: 240 };
const VEHICLE_RATIO = { car: 0.5, bus: 0.36, truck: 0.42, motorcycle: 0.32, bicycle: 0.3 } as const;
const TEXT_FONT = { title: 46, body: 34, caption: 27 } as const;
const HEADING_DEG = { E: 0, S: 90, W: 180, N: 270 } as const;

/** Ritmo de captura de los movimientos lentos (aparecer, contar, pulso); los desplazamientos usan el máximo. */
const SLOW_FPS = 15;

export interface Track {
  id: string;
  prop: 'x' | 'y' | 'rot' | 'scale' | 'sx' | 'opacity' | 'draw' | 'count' | 'pulse' | 'badge' | 'cx' | 'cy' | 'zoom';
  t0: number;
  t1: number;
  from: number;
  to: number;
  ease: 'out' | 'in' | 'inout' | 'linear';
  fps?: number;
}

export interface CompiledMotion {
  html: string;
  tracks: Track[];
  initial: Record<string, Record<string, number>>;
  numbers: Record<string, { prefix: string; suffix: string; decimals: number }>;
  /** Para la revisión de distribución: qué ids son piezas (no fondos ni vías). */
  pieces: string[];
  /** Fin de cada beat (instante en que se revisa la distribución). */
  checkpoints: number[];
  /** Piezas que se desplazan: pueden llegar encima de otra a propósito (la moneda a la alcancía). */
  movers: string[];
}

export function colorOf(token: ColorToken | null, brand: { primaryColor: string; secondaryColor: string }, fallback: string): string {
  switch (token) {
    case 'primary': return brand.primaryColor;
    case 'secondary': return brand.secondaryColor;
    case 'success': case 'green': return '#16A34A';
    case 'danger': case 'red': return '#DC2626';
    case 'warning': return '#F59E0B';
    case 'yellow': return '#FACC15';
    case 'orange': return '#F97316';
    case 'blue': return '#2563EB';
    case 'neutral': case 'gray': return '#64748B';
    case 'white': return '#F8FAFC';
    case 'black': return '#1F2937';
    default: return fallback;
  }
}

export const cx = (c: Cell): number => (c.col + 0.5) * CELL_W;
export const cy = (c: Cell): number => (c.row + 0.5) * CELL_H;
const domId = (id: string): string => `m-${id}`;

// ─── Vehículos vistos desde arriba (miran al este; el runtime los gira) ───────

function vehicleSvg(kind: keyof typeof VEHICLE_RATIO, color: string): string {
  const glass = '#1F2937';
  switch (kind) {
    case 'car':
      return `<svg viewBox="0 0 100 50" width="100%" height="100%">
<rect x="2" y="3" width="96" height="44" rx="15" fill="${color}" stroke="rgba(0,0,0,0.25)" stroke-width="2"/>
<rect x="60" y="8" width="15" height="34" rx="5" fill="${glass}" opacity="0.85"/>
<rect x="15" y="9" width="10" height="32" rx="4" fill="${glass}" opacity="0.7"/>
<rect x="28" y="8" width="30" height="34" rx="7" fill="#fff" opacity="0.18"/>
<rect x="93" y="8" width="5" height="9" rx="2" fill="#FEF3C7"/><rect x="93" y="33" width="5" height="9" rx="2" fill="#FEF3C7"/>
<rect x="2" y="9" width="4" height="8" rx="2" fill="#F87171"/><rect x="2" y="33" width="4" height="8" rx="2" fill="#F87171"/></svg>`;
    case 'bus':
      return `<svg viewBox="0 0 140 50" width="100%" height="100%">
<rect x="2" y="3" width="136" height="44" rx="8" fill="${color}" stroke="rgba(0,0,0,0.25)" stroke-width="2"/>
<rect x="122" y="7" width="12" height="36" rx="4" fill="${glass}" opacity="0.85"/>
<rect x="14" y="11" width="100" height="28" rx="5" fill="#fff" opacity="0.2"/>
<rect x="30" y="17" width="16" height="16" rx="3" fill="${glass}" opacity="0.25"/><rect x="70" y="17" width="16" height="16" rx="3" fill="${glass}" opacity="0.25"/></svg>`;
    case 'truck':
      return `<svg viewBox="0 0 120 50" width="100%" height="100%">
<rect x="2" y="2" width="84" height="46" rx="5" fill="#E5E7EB" stroke="rgba(0,0,0,0.25)" stroke-width="2"/>
<rect x="90" y="5" width="28" height="40" rx="9" fill="${color}" stroke="rgba(0,0,0,0.25)" stroke-width="2"/>
<rect x="105" y="10" width="9" height="30" rx="3" fill="${glass}" opacity="0.85"/></svg>`;
    case 'motorcycle':
      return `<svg viewBox="0 0 100 32" width="100%" height="100%">
<rect x="4" y="12" width="92" height="8" rx="4" fill="#374151"/>
<rect x="22" y="6" width="50" height="20" rx="10" fill="${color}" stroke="rgba(0,0,0,0.25)" stroke-width="2"/>
<circle cx="44" cy="16" r="10" fill="#1F2937"/><circle cx="44" cy="16" r="6" fill="#9CA3AF"/></svg>`;
    case 'bicycle':
      return `<svg viewBox="0 0 100 30" width="100%" height="100%">
<rect x="4" y="13" width="92" height="4" rx="2" fill="#374151"/>
<rect x="30" y="6" width="34" height="18" rx="9" fill="${color}" stroke="rgba(0,0,0,0.25)" stroke-width="2"/>
<circle cx="46" cy="15" r="8" fill="#1F2937"/></svg>`;
  }
}

// ─── Geometría de cada pieza ─────────────────────────────────────────────────

export interface Geometry { x: number; y: number; w: number; h: number; round: boolean }

function textHeight(el: Extract<MotionElement, { type: 'text' }>): number {
  const font = TEXT_FONT[el.style];
  const pad = el.style === 'title' ? 0 : 44;
  // Inter en negrita: ~0,58 del tamaño de letra por carácter en promedio
  const charsPerLine = Math.max(8, Math.floor((el.width * CELL_W - pad) / (font * 0.58)));
  return Math.ceil(el.text.length / charsPerLine) * font * 1.25 + pad;
}

export function geometry(el: MotionElement): Geometry | null {
  switch (el.type) {
    case 'illustration':
    case 'icon':
      return { x: cx(el.at), y: cy(el.at), w: BOX[el.size], h: BOX[el.size], round: el.type === 'icon' };
    case 'vehicle': {
      const len = VEHICLE_LEN[el.size];
      return { x: cx(el.at), y: cy(el.at), w: len, h: len * VEHICLE_RATIO[el.vehicle], round: false };
    }
    case 'text':
      return { x: cx(el.at), y: cy(el.at), w: el.width * CELL_W - 16, h: textHeight(el), round: false };
    case 'number': {
      const f = NUMBER_FONT[el.size];
      // Ancho del número más largo que llega a mostrar (con separadores de miles)
      const digits = Math.max(String(Math.round(Math.abs(el.value))).length, ...el.counts.map((n) => String(Math.round(Math.abs(n))).length));
      const chars = el.prefix.length + el.suffix.length + digits + Math.floor((digits - 1) / 3) + (el.decimals ? el.decimals + 1 : 0);
      return { x: cx(el.at), y: cy(el.at), w: Math.max(f * 1.5, chars * f * 0.62), h: f * 1.1, round: false };
    }
    case 'zone': {
      // La zona se ancla en su celda superior izquierda y cubre span columnas × filas
      const w = el.span[0] * CELL_W - 12;
      const h = el.span[1] * CELL_H - 12;
      return { x: el.at.col * CELL_W + el.span[0] * CELL_W / 2, y: el.at.row * CELL_H + el.span[1] * CELL_H / 2, w, h, round: el.shape === 'circle' };
    }
    case 'roundabout':
      return { x: cx(el.at), y: cy(el.at), w: BOX[el.size] * 1.3, h: BOX[el.size] * 1.3, round: true };
    case 'road':
      return null;
  }
}

// ─── Pistas de animación ─────────────────────────────────────────────────────

class TrackBuilder {
  readonly tracks: Track[] = [];
  readonly initial: Record<string, Record<string, number>> = {};
  private readonly last = new Map<string, { value: number; until: number }>();

  constructor(private readonly end: number) {}

  init(id: string, prop: Track['prop'], value: number): void {
    (this.initial[id] ??= {})[prop] = value;
    this.last.set(`${id}|${prop}`, { value, until: 0 });
  }

  value(id: string, prop: Track['prop'], fallback = 0): number {
    return this.last.get(`${id}|${prop}`)?.value ?? this.initial[id]?.[prop] ?? fallback;
  }

  /** Agrega un tramo; si se cruza con el anterior de la misma propiedad, empieza cuando aquel termina. */
  add(id: string, prop: Track['prop'], t0: number, dur: number, to: number, ease: Track['ease'] = 'out', fps?: number): number {
    const key = `${id}|${prop}`;
    const prev = this.last.get(key);
    let start = Math.max(t0, prev?.until ?? 0);
    const limit = Math.max(0, this.end - 0.1);
    start = Math.min(start, limit);
    const stop = Math.min(start + dur, limit);
    const from = prev?.value ?? this.initial[id]?.[prop] ?? 0;
    this.tracks.push({ id, prop, t0: start, t1: stop, from, to, ease, ...(fps ? { fps } : {}) });
    this.last.set(key, { value: to, until: stop });
    return stop;
  }
}

/** Distancia del centro de una caja a su borde en la dirección (dx, dy). */
function rectExit(g: Geometry, dx: number, dy: number): number {
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx === 0 ? Infinity : (g.w / 2) / Math.abs(dx / len);
  const ty = dy === 0 ? Infinity : (g.h / 2) / Math.abs(dy / len);
  return Math.min(tx, ty);
}

/** Vías de dos carriles como tramos en píxeles (para ubicar los vehículos en su carril). */
function twoLaneSegments(spec: MotionSpec): Array<[number, number, number, number]> {
  return spec.elements.flatMap((e) => (e.type === 'road' && e.lanes === 2
    ? e.path.slice(1).map((c, i) => [cx(e.path[i]!), cy(e.path[i]!), cx(c), cy(c)] as [number, number, number, number])
    : []));
}

function onSegment(x: number, y: number, [x0, y0, x1, y1]: [number, number, number, number]): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
  return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) < 6;
}

/** En Colombia se conduce por la derecha: sobre una vía de dos carriles, el vehículo va en el carril derecho. */
const LANE_OFFSET = 30;
function inLane(x: number, y: number, deg: number, roads: Array<[number, number, number, number]>): [number, number] {
  if (!roads.some((r) => onSegment(x, y, r))) return [x, y];
  const a = (deg * Math.PI) / 180;
  return [x - Math.sin(a) * LANE_OFFSET, y + Math.cos(a) * LANE_OFFSET];
}

function angleTo(x0: number, y0: number, x1: number, y1: number): number {
  return (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
}

/** Giro por el camino corto (de 350° a 10° son 20°, no 340°). */
function nearestAngle(from: number, to: number): number {
  let d = ((to - from) % 360 + 540) % 360 - 180;
  if (d === -180) d = 180;
  return from + d;
}

function arrowPath(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number): string {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const sx = x0 + ux * r0;
  const sy = y0 + uy * r0;
  const ex = x1 - ux * r1;
  const ey = y1 - uy * r1;
  // Curva suave hacia un lado: se lee mejor que una recta y no tapa lo que hay en medio
  const mx = (sx + ex) / 2 - uy * len * 0.12;
  const my = (sy + ey) / 2 + ux * len * 0.12;
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

function arrowHead(x1: number, y1: number, mx: number, my: number, color: string): string {
  const a = Math.atan2(y1 - my, x1 - mx);
  const p = (d: number, off: number): string =>
    `${(x1 - Math.cos(a + off) * d).toFixed(1)},${(y1 - Math.sin(a + off) * d).toFixed(1)}`;
  return `<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${p(26, 0.45)} ${p(26, -0.45)}" fill="${color}"/>`;
}

/** Fin (punto) y punto de control de un camino "M sx sy Q mx my ex ey". */
function pathEnds(d: string): { mx: number; my: number; ex: number; ey: number } {
  const n = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  return { mx: n[2]!, my: n[3]!, ex: n[4]!, ey: n[5]! };
}

/**
 * Compila el guion: HTML de la escena y pistas de animación. beatTimes trae el segundo en que
 * empieza cada beat (sale de la voz, ver reveal-timing.ts).
 */
export function compileMotion(
  spec: MotionSpec,
  beatTimes: number[],
  duration: number,
  brand: { primaryColor: string; secondaryColor: string },
): CompiledMotion {
  const end = Math.max(duration, 1);
  const tb = new TrackBuilder(end);
  const hidden = initiallyHidden(spec);
  // Si al empezar no se vería ninguna pieza, las que aparecen después se ven tenues desde el inicio
  // (como los diagramas de siempre): la pantalla nunca queda vacía mientras la voz introduce el tema
  const visibleAtStart = spec.elements.some((e) => e.type !== 'road' && e.type !== 'zone' && !hidden.has(e.id));
  const startOpacity = visibleAtStart ? 0 : 0.16;
  const geo = new Map<string, Geometry>();
  const byId = new Map(spec.elements.map((e) => [e.id, e]));
  for (const el of spec.elements) {
    const g = geometry(el);
    if (g) geo.set(el.id, g);
  }

  const roads = twoLaneSegments(spec);
  const under: string[] = [];
  const pieces: string[] = [];
  const over: string[] = [];
  const numbers: CompiledMotion['numbers'] = {};

  // Fondo del escenario
  let backdrop = '';
  if (spec.scenario === 'map') {
    backdrop = `<div class="mo-map"></div>`;
  } else if (spec.scenario === 'versus' && spec.panels) {
    const panel = (side: 'left' | 'right'): string => {
      const p = spec.panels![side];
      const tone = p.tone === 'correct' ? '#16A34A' : p.tone === 'incorrect' ? '#DC2626' : brand.primaryColor;
      const mark = p.tone === 'correct' ? '<path d="M7 13l4 4 8-9" />' : p.tone === 'incorrect' ? '<path d="M7 7l10 10M17 7L7 17" />' : '<circle cx="12" cy="12" r="3" />';
      return `<div class="mo-panel mo-panel-${side}" style="background:${alpha(tone, 0.07)};box-shadow:inset 0 0 0 3px ${alpha(tone, 0.22)}">
  <div class="mo-panel-head" style="color:${tone}"><span class="mo-panel-mark" style="background:${tone}"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round">${mark}</svg></span>${escape(p.title)}</div>
</div>`;
    };
    backdrop = panel('left') + panel('right');
  }

  for (const el of spec.elements) {
    const id = domId(el.id);
    const color = colorOf(el.color, brand, el.type === 'zone' ? '#F59E0B' : brand.primaryColor);

    if (el.type === 'road') {
      const pts = el.path.map((c) => `${cx(c).toFixed(1)},${cy(c).toFixed(1)}`).join(' ');
      const width = el.lanes === 2 ? 118 : 84;
      under.push(`<g id="${id}"><polyline points="${pts}" fill="none" stroke="#C7CDD4" stroke-width="${width + 14}" stroke-linejoin="round" stroke-linecap="round"/>
<polyline points="${pts}" fill="none" stroke="#4B5563" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>
${el.lanes === 2 ? `<polyline points="${pts}" fill="none" stroke="#F8FAFC" stroke-width="5" stroke-dasharray="26 20" stroke-linejoin="round"/>` : ''}</g>`);
      tb.init(id, 'opacity', hidden.has(el.id) ? 0 : 1);
      continue;
    }

    const g = geo.get(el.id)!;
    let body = '';
    let cls = '';
    switch (el.type) {
      case 'illustration':
        body = assetSvg(el.asset);
        break;
      case 'icon':
        body = `<div class="mo-icon" style="box-shadow:0 0 0 4px ${alpha(color, 0.18)}"><div style="width:56%;height:56%">${assetSvg(el.asset, color, 2)}</div></div>`;
        break;
      case 'vehicle':
        body = vehicleSvg(el.vehicle, colorOf(el.color, brand, '#2563EB'));
        break;
      case 'text':
        cls = ` mo-text mo-text-${el.style}`;
        body = `<div class="mo-text-in" style="font-size:${TEXT_FONT[el.style]}px;${el.style === 'title' ? `color:${color}` : `border-left:8px solid ${color}`}">${escape(el.text)}</div>`;
        break;
      case 'number':
        numbers[id] = { prefix: el.prefix, suffix: el.suffix, decimals: el.decimals };
        body = `<div class="mo-number" style="font-size:${NUMBER_FONT[el.size]}px;color:${color}" data-count></div>`;
        break;
      case 'zone':
        cls = ' mo-zone';
        body = `<div class="mo-zone-in" style="border-color:${color};background:${alpha(color, 0.14)};border-radius:${el.shape === 'circle' ? '50%' : '28px'}"></div>`;
        break;
      case 'roundabout':
        body = `<svg viewBox="0 0 200 200" width="100%" height="100%"><circle cx="100" cy="100" r="78" fill="none" stroke="#C7CDD4" stroke-width="54"/>
<circle cx="100" cy="100" r="78" fill="none" stroke="#4B5563" stroke-width="44"/><circle cx="100" cy="100" r="78" fill="none" stroke="#F8FAFC" stroke-width="2.5" stroke-dasharray="12 10"/>
<circle cx="100" cy="100" r="50" fill="#B7DDB0" stroke="#F8FAFC" stroke-width="4"/></svg>`;
        break;
    }
    // La etiqueta de un vehículo va aparte (ver más abajo): dentro de él giraría con el vehículo
    const label = 'label' in el && el.label && el.type !== 'vehicle' ? `<div class="mo-label">${escape(el.label)}</div>` : '';
    const radius = g.round || el.type === 'roundabout' ? '50%' : el.type === 'text' || el.type === 'zone' ? '22px' : '28px';
    const sizeCss = el.type === 'text' ? `width:${g.w}px` : `width:${g.w}px;height:${g.h}px`;
    const z = el.type === 'zone' || el.type === 'roundabout' ? 1 : el.type === 'text' ? 4 : 3;
    pieces.push(`<div class="mo-el${cls}" id="${id}" style="${sizeCss};z-index:${z}">
<div class="mo-ring" style="border-radius:${radius};border-color:${brand.secondaryColor}"></div>${body}${label}<div class="mo-badge"></div></div>`);

    const [x0, y0] = el.type === 'vehicle' ? inLane(g.x, g.y, HEADING_DEG[el.heading], roads) : [g.x, g.y];
    tb.init(id, 'x', x0);
    tb.init(id, 'y', y0);
    tb.init(id, 'rot', el.type === 'vehicle' ? HEADING_DEG[el.heading] : 0);
    tb.init(id, 'scale', 1);
    tb.init(id, 'sx', 1);
    tb.init(id, 'opacity', hidden.has(el.id) ? startOpacity : 1);
    tb.init(id, 'pulse', 0);
    tb.init(id, 'badge', 0);
    if (el.type === 'number') tb.init(id, 'count', el.value);
  }

  // Textos que señalan una pieza: línea guía que se dibuja con el texto
  for (const el of spec.elements) {
    if (el.type !== 'text' || !el.pointsTo) continue;
    const a = geo.get(el.id)!;
    const b = geo.get(el.pointsTo);
    if (!b) continue;
    const id = `${domId(el.id)}-lead`;
    const r0 = rectExit(a, b.x - a.x, b.y - a.y) + 10;
    const r1 = Math.max(b.w, b.h) / 2 * 0.8;
    const d = arrowPath(a.x, a.y, b.x, b.y, r0, r1 + 8);
    const { ex, ey } = pathEnds(d);
    over.push(`<g id="${id}"><path d="${d}" fill="none" stroke="#14161A" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round" data-len/><circle cx="${ex}" cy="${ey}" r="9" fill="#14161A"/></g>`);
    tb.init(id, 'draw', hidden.has(el.id) ? 0 : 1);
  }

  // Cámara
  tb.init('cam', 'cx', STAGE_W / 2);
  tb.init('cam', 'cy', STAGE_H / 2);
  tb.init('cam', 'zoom', 1);

  const checkpoints: number[] = [];
  let connectN = 0;
  spec.beats.forEach((beat, i) => {
    const t = Math.max(0, beatTimes[i] ?? 0.6 + i * 2);
    let appearN = 0;
    let beatEnd = t + 0.6;
    for (const a of beat.actions) {
      switch (a.do) {
        case 'appear': {
          const id = domId(a.target);
          const t0 = t + 0.15 * appearN++;
          if (byId.get(a.target)!.type === 'road') {
            beatEnd = Math.max(beatEnd, tb.add(id, 'opacity', t0, 0.5, 1));
            break;
          }
          tb.add(id, 'scale', t0, 0, 0.85, 'linear');
          tb.add(id, 'scale', t0, 0.55, 1, 'out', SLOW_FPS);
          beatEnd = Math.max(beatEnd, tb.add(id, 'opacity', t0, 0.45, 1, 'out', SLOW_FPS));
          const lead = `${id}-lead`;
          if (tb.initial[lead]) tb.add(lead, 'draw', t0 + 0.3, 0.6, 1, 'inout', SLOW_FPS);
          break;
        }
        case 'hide': {
          const id = domId(a.target);
          beatEnd = Math.max(beatEnd, tb.add(id, 'opacity', t, 0.4, 0, 'out', SLOW_FPS));
          const lead = `${id}-lead`;
          if (tb.initial[lead]) tb.add(lead, 'draw', t, 0.3, 0, 'out', SLOW_FPS);
          break;
        }
        case 'move': {
          const id = domId(a.target);
          const el = byId.get(a.target)!;
          let x = tb.value(id, 'x');
          let y = tb.value(id, 'y');
          let points = [...a.via, a.to].map((c) => [cx(c), cy(c)] as const);
          if (el.type === 'vehicle') {
            // Cada punto en el carril derecho según hacia dónde va el tramo que llega a él
            let [px, py] = [x, y];
            points = points.map(([qx, qy]) => {
              const p = inLane(qx, qy, angleTo(px, py, qx, qy), roads);
              [px, py] = [qx, qy];
              return p;
            });
          }
          const lengths = points.map(([px, py], k) => {
            const [qx, qy] = k === 0 ? [x, y] : points[k - 1]!;
            return Math.hypot(px - qx, py - qy);
          });
          const total = lengths.reduce((s, l) => s + l, 0);
          if (total < 1) break;
          const seconds = a.seconds ?? Math.max(0.8, Math.min(4, total / 420));
          if (el.type === 'illustration') {
            // Las ilustraciones miran a un lado: al ir hacia el otro se voltean (sin girar)
            const goesRight = points[points.length - 1]![0] > x + 1;
            const goesLeft = points[points.length - 1]![0] < x - 1;
            const flip = (goesRight && el.faces === 'left') || (goesLeft && el.faces === 'right') ? -1 : 1;
            if (flip !== tb.value(id, 'sx', 1)) tb.add(id, 'sx', t, 0, flip, 'linear');
          }
          let tk = t;
          points.forEach(([px, py], k) => {
            const dur = (seconds * lengths[k]!) / total;
            if (dur <= 0) return;
            const ease: Track['ease'] = points.length === 1 ? 'inout' : k === 0 ? 'in' : k === points.length - 1 ? 'out' : 'linear';
            if (el.type === 'vehicle') {
              const target = nearestAngle(tb.value(id, 'rot'), angleTo(x, y, px, py));
              if (Math.abs(target - tb.value(id, 'rot')) > 0.5) tb.add(id, 'rot', Math.max(t, tk - 0.15), Math.min(0.45, dur), target, 'inout');
            }
            tb.add(id, 'x', tk, dur, px, ease);
            tb.add(id, 'y', tk, dur, py, ease);
            tk += dur;
            x = px;
            y = py;
          });
          beatEnd = Math.max(beatEnd, tk);
          break;
        }
        case 'highlight': {
          const id = domId(a.target);
          tb.add(id, 'pulse', t, 0, 0, 'linear');
          tb.add(id, 'pulse', t, 0.9, 1, 'out', SLOW_FPS);
          tb.add(id, 'pulse', t + 0.9, 0, 0, 'linear');
          tb.add(id, 'pulse', t + 0.9, 0.9, 1, 'out', SLOW_FPS);
          const s = tb.value(id, 'scale', 1);
          tb.add(id, 'scale', t, 0.3, s * 1.1, 'out', SLOW_FPS);
          beatEnd = Math.max(beatEnd, tb.add(id, 'scale', t + 0.3, 0.45, s, 'inout', SLOW_FPS));
          break;
        }
        case 'connect': {
          const from = domId(a.from);
          const to = domId(a.to);
          const ga = geo.get(a.from);
          const gb = geo.get(a.to);
          if (!ga || !gb) break;
          const x0 = tb.value(from, 'x');
          const y0 = tb.value(from, 'y');
          const x1 = tb.value(to, 'x');
          const y1 = tb.value(to, 'y');
          const d = arrowPath(x0, y0, x1, y1, Math.max(ga.w, ga.h) / 2 * 0.75 + 10, Math.max(gb.w, gb.h) / 2 * 0.75 + 14);
          const { mx, my, ex, ey } = pathEnds(d);
          const id = `m-link-${++connectN}`;
          const stroke = brand.secondaryColor;
          const label = a.label
            ? `<foreignObject x="${(mx - 160).toFixed(0)}" y="${(my - 30).toFixed(0)}" width="320" height="60"><div xmlns="http://www.w3.org/1999/xhtml" class="mo-link-label"><span>${escape(a.label)}</span></div></foreignObject>`
            : '';
          over.push(`<g id="${id}"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="7" stroke-linecap="round" data-len/>${arrowHead(ex, ey, mx, my, stroke)}${label}</g>`);
          tb.init(id, 'draw', 0);
          beatEnd = Math.max(beatEnd, tb.add(id, 'draw', t, 0.7, 1, 'inout', SLOW_FPS));
          break;
        }
        case 'count': {
          const id = domId(a.target);
          beatEnd = Math.max(beatEnd, tb.add(id, 'count', t, 1.4, a.to, 'out', SLOW_FPS));
          break;
        }
        case 'mark': {
          const id = domId(a.target);
          pieces.push(`<style>#${id} .mo-badge{background:${a.as === 'correct' ? '#16A34A' : '#DC2626'}}#${id} .mo-badge::after{content:'${a.as === 'correct' ? '✓' : '✕'}'}</style>`);
          beatEnd = Math.max(beatEnd, tb.add(id, 'badge', t, 0.45, 1, 'out', SLOW_FPS));
          break;
        }
        case 'focus': {
          const z = a.zoom;
          let fx = a.target ? tb.value(domId(a.target), 'x') : cx(a.at!);
          let fy = a.target ? tb.value(domId(a.target), 'y') : cy(a.at!);
          // Sin mostrar nada fuera del escenario
          fx = Math.max(STAGE_W / (2 * z), Math.min(STAGE_W - STAGE_W / (2 * z), fx));
          fy = Math.max(STAGE_H / (2 * z), Math.min(STAGE_H - STAGE_H / (2 * z), fy));
          tb.add('cam', 'cx', t, 0.9, fx, 'inout');
          tb.add('cam', 'cy', t, 0.9, fy, 'inout');
          beatEnd = Math.max(beatEnd, tb.add('cam', 'zoom', t, 0.9, z, 'inout'));
          break;
        }
        case 'reset_focus':
          tb.add('cam', 'cx', t, 0.9, STAGE_W / 2, 'inout');
          tb.add('cam', 'cy', t, 0.9, STAGE_H / 2, 'inout');
          beatEnd = Math.max(beatEnd, tb.add('cam', 'zoom', t, 0.9, 1, 'inout'));
          break;
      }
    }
    checkpoints.push(Math.min(beatEnd + 0.05, end - 0.05));
  });

  // Etiquetas de vehículos: siguen la posición del vehículo pero siempre derechas y debajo de él
  const tags: string[] = [];
  for (const el of spec.elements) {
    if (el.type !== 'vehicle' || !el.label) continue;
    const id = domId(el.id);
    const tag = `${id}-tag`;
    const g = geo.get(el.id)!;
    const off = Math.max(g.w, g.h) / 2 - 8;
    pieces.push(`<div class="mo-el mo-tag" id="${tag}" style="width:0;height:0;z-index:4"><div class="mo-label">${escape(el.label)}</div></div>`);
    tags.push(tag);
    for (const [prop, v] of Object.entries(tb.initial[id]!)) {
      if (prop === 'x' || prop === 'opacity') tb.initial[tag] = { ...tb.initial[tag], [prop]: v };
      if (prop === 'y') tb.initial[tag] = { ...tb.initial[tag], y: v + off };
    }
    tb.initial[tag] = { rot: 0, scale: 1, sx: 1, pulse: 0, badge: 0, ...tb.initial[tag] };
    for (const t of tb.tracks.filter((x) => x.id === id && (x.prop === 'x' || x.prop === 'y' || x.prop === 'opacity'))) {
      tb.tracks.push(t.prop === 'y' ? { ...t, id: tag, from: t.from + off, to: t.to + off } : { ...t, id: tag });
    }
  }

  const html = `<div class="mo-stage"><div class="mo-cam" id="m-cam">
${backdrop}
<svg class="mo-under" width="${STAGE_W}" height="${STAGE_H}">${under.join('\n')}</svg>
${pieces.join('\n')}
<svg class="mo-over" width="${STAGE_W}" height="${STAGE_H}">${over.join('\n')}</svg>
</div></div>`;

  return {
    html,
    tracks: tb.tracks,
    initial: tb.initial,
    numbers,
    pieces: [...spec.elements.filter((e) => e.type !== 'road' && e.type !== 'zone' && e.type !== 'roundabout').map((e) => domId(e.id)), ...tags],
    movers: [...new Set(spec.beats.flatMap((b) => b.actions.filter((a) => a.do === 'move').map((a) => domId((a as { target: string }).target))))],
    checkpoints,
  };
}

const MOTION_CSS = `.stage { top:206px; bottom:150px; }
.header { padding-top:52px; } .scene-title { font-size:56px !important; }
.mo-stage { position:absolute; left:110px; top:50%; width:${STAGE_W}px; height:${STAGE_H}px; margin-top:-${STAGE_H / 2}px; overflow:hidden; border-radius:28px; }
.mo-cam { position:absolute; inset:0; transform-origin:0 0; }
.mo-map { position:absolute; inset:0; background:#DCEFD7; border-radius:28px;
  background-image:radial-gradient(rgba(22,101,52,0.08) 2px, transparent 2px); background-size:40px 40px; }
.mo-panel { position:absolute; top:0; bottom:0; width:${STAGE_W / 2 - 12}px; border-radius:28px; }
.mo-panel-left { left:0; } .mo-panel-right { right:0; }
.mo-panel-head { display:flex; align-items:center; gap:16px; height:${CELL_H}px; padding:0 30px; font-family:'Nunito',sans-serif;
  font-weight:900; font-size:40px; }
.mo-panel-mark { width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
.mo-under, .mo-over { position:absolute; left:0; top:0; overflow:visible; }
.mo-under { z-index:0; } .mo-over { z-index:5; pointer-events:none; }
.mo-el { position:absolute; left:0; top:0; will-change:transform,opacity; }
.mo-el > svg { display:block; width:100%; height:100%; filter:drop-shadow(0 10px 14px rgba(20,22,26,0.16)); }
.mo-icon { width:100%; height:100%; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center;
  box-shadow:0 14px 30px rgba(20,22,26,0.12); }
.mo-icon svg { display:block; width:100%; height:100%; }
.mo-text-in { font-family:'Inter',sans-serif; font-weight:700; line-height:1.25; color:#14161A; text-wrap:balance; }
.mo-text-body .mo-text-in, .mo-text-caption .mo-text-in { background:#fff; border-radius:20px; padding:18px 24px;
  box-shadow:0 14px 34px rgba(20,22,26,0.12); }
.mo-text-caption .mo-text-in { font-weight:600; }
.mo-text-title .mo-text-in { font-family:'Nunito',sans-serif; font-weight:900; line-height:1.1; text-align:center; }
.mo-number { font-family:'Nunito',sans-serif; font-weight:900; line-height:1.1; text-align:center; white-space:nowrap;
  display:flex; align-items:center; justify-content:center; height:100%; }
.mo-zone-in { width:100%; height:100%; border:5px dashed; }
.mo-label { position:absolute; left:50%; top:100%; transform:translate(-50%, 10px); white-space:nowrap; background:#fff;
  border-radius:999px; padding:7px 18px; font-family:'Inter',sans-serif; font-weight:700; font-size:25px; color:#14161A;
  box-shadow:0 8px 20px rgba(20,22,26,0.14); }
.mo-zone .mo-label { top:14px; transform:translate(-50%, 0); }
.mo-ring { position:absolute; inset:-16px; border:6px solid; opacity:0; pointer-events:none; }
.mo-badge { position:absolute; right:-14px; top:-14px; width:58px; height:58px; border-radius:50%; opacity:0; display:flex;
  align-items:center; justify-content:center; color:#fff; font-size:36px; font-weight:900; font-family:'Inter',sans-serif;
  box-shadow:0 6px 14px rgba(0,0,0,0.25); z-index:6; }
.mo-link-label { display:flex; align-items:center; justify-content:center; height:100%; }
.mo-link-label span { background:#fff; border-radius:999px; padding:6px 16px; font-family:'Inter',sans-serif; font-weight:700;
  font-size:24px; color:#14161A; box-shadow:0 6px 16px rgba(20,22,26,0.12); white-space:nowrap; }`;

function motionRuntime(c: CompiledMotion, duration: number, live: boolean): string {
  const data = { tracks: c.tracks, initial: c.initial, numbers: c.numbers, pieces: c.pieces, movers: c.movers, checkpoints: c.checkpoints };
  return `<script>
(function () {
  var D = ${JSON.stringify(data)};
  var EASE = {
    linear: function (p) { return p; },
    out: function (p) { return 1 - Math.pow(1 - p, 3); },
    'in': function (p) { return p * p * p; },
    inout: function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
  };
  // Pistas agrupadas por elemento y propiedad, en orden (el compilador ya evita que se crucen)
  var groups = {};
  D.tracks.forEach(function (t) { var k = t.id + '|' + t.prop; (groups[k] = groups[k] || []).push(t); });
  var ids = Object.keys(D.initial);
  var lens = {};
  document.querySelectorAll('[data-len]').forEach(function (p) { lens[p.parentNode.id] = p.getTotalLength(); });

  function val(id, prop, t) {
    var v = D.initial[id][prop];
    var list = groups[id + '|' + prop];
    if (!list) return v;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (t >= s.t1) { v = s.to; continue; }
      if (t > s.t0) v = s.from + (s.to - s.from) * EASE[s.ease]((t - s.t0) / (s.t1 - s.t0));
      break;
    }
    return v;
  }

  function fmt(id, n) {
    var f = D.numbers[id];
    return f.prefix + Number(n).toLocaleString('es-CO', { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals }) + f.suffix;
  }

  function seek(t) {
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var init = D.initial[id];
      if ('draw' in init) {
        var d = val(id, 'draw', t);
        var path = el.querySelector('[data-len]');
        var len = lens[id] || 1;
        path.style.strokeDasharray = len + ' ' + len;
        path.style.strokeDashoffset = String(len * (1 - d));
        Array.prototype.forEach.call(el.children, function (ch) { if (ch !== path) ch.style.opacity = d > 0.92 ? 1 : 0; });
        return;
      }
      el.style.opacity = val(id, 'opacity', t);
      if (!('x' in init)) return;
      var x = val(id, 'x', t), y = val(id, 'y', t), r = val(id, 'rot', t), s = val(id, 'scale', t), sx = val(id, 'sx', t);
      el.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) translate(-50%,-50%) rotate(' + r.toFixed(2) + 'deg) scale(' + (s * sx).toFixed(4) + ',' + s.toFixed(4) + ')';
      // Las etiquetas y textos no se voltean ni se giran con la pieza
      var label = el.querySelector('.mo-label');
      if (label) label.style.transform = 'translate(-50%, 10px) scale(' + sx + ',1) rotate(' + (-r).toFixed(2) + 'deg)';
      var p = val(id, 'pulse', t);
      var ring = el.querySelector('.mo-ring');
      if (ring) { ring.style.opacity = p > 0 && p < 1 ? String(0.9 * (1 - p)) : '0'; ring.style.transform = 'scale(' + (1 + 0.35 * p) + ')'; }
      var b = val(id, 'badge', t);
      var badge = el.querySelector('.mo-badge');
      if (badge) { badge.style.opacity = b; badge.style.transform = 'scale(' + (0.4 + 0.6 * b) * sx + ',' + (0.4 + 0.6 * b) + ')'; }
      if ('count' in init) el.querySelector('[data-count]').textContent = fmt(id, val(id, 'count', t));
    });
    var cam = document.getElementById('m-cam');
    var z = val('cam', 'zoom', t), cx = val('cam', 'cx', t), cy = val('cam', 'cy', t);
    cam.style.transform = 'translate(${STAGE_W / 2}px,${STAGE_H / 2}px) scale(' + z.toFixed(4) + ') translate(' + (-cx).toFixed(2) + 'px,' + (-cy).toFixed(2) + 'px)';
  }

  window.__anim = {
    seek: seek,
    motionWindows: function () {
      return D.tracks.filter(function (t) { return t.t1 > t.t0; })
        .map(function (t) { return t.fps ? [t.t0, t.t1, t.fps] : [t.t0, t.t1]; });
    },
    pieces: D.pieces,
    movers: D.movers,
    checkpoints: D.checkpoints,
  };
  seek(${live ? 0 : 'Infinity'});
})();
</script>`;
}

/** HTML completo de la escena animada. Sin timeline (sin voz o dry-run) se dibuja el estado final. */
export function buildMotionTemplate(data: SlideTemplateData, spec: MotionSpec, duration: number): string {
  const { brand, scene } = data;
  const beatTimes = data.timeline?.revealTimes ?? spec.beats.map((_, i) => 0.8 + i * 2.5);
  const total = data.timeline ? duration : Math.max(duration, beatTimes[beatTimes.length - 1]! + 4);
  const compiled = compileMotion(spec, beatTimes, total, brand);
  const html = editorialPage({ brand, eyebrow: eyebrow(data, ''), title: scene.title ?? '', css: MOTION_CSS, body: compiled.html, timeline: null, ghost: false });
  return html.replace('</body>', `${motionRuntime(compiled, total, !!data.timeline)}\n</body>`);
}
