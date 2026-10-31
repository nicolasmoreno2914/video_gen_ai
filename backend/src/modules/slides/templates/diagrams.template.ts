import { SlideTemplateData } from '../slides.service';
import { escape } from './shared';
import { alpha, editorialPage } from './editorial';
import { iconSvg } from './icons';

// Plantillas "editoriales": tarjetas con iconos y diagramas dibujados en SVG.
// Cada elemento de on_screen_text es un nodo (data-reveal = índice + 1) y los
// conectores se dibujan con data-draw sincronizados con el nodo al que llegan.

const EYEBROWS: Record<string, string> = {
  hook: 'Para empezar', context: 'Contexto', explanation: 'Concepto clave', process: 'Paso a paso',
  comparison: 'Comparación', application: 'En la práctica', example: 'Ejemplo', summary: 'En resumen',
  conclusion: 'Para cerrar',
};

export function sceneItems(data: SlideTemplateData, max: number): Array<{ text: string; icon: string | null }> {
  const raw = data.scene.on_screen_text ?? [];
  const texts = (Array.isArray(raw) ? raw : [String(raw)]).slice(0, max);
  const icons = data.scene.icons ?? [];
  // Si la mayoría tiene icono, los que faltan usan uno neutro (antes salía un "1" suelto)
  const withIcon = texts.filter((_, i) => icons[i]).length;
  const fill = withIcon * 2 >= texts.length ? 'sparkles' : null;
  return texts.map((text, i) => ({ text, icon: icons[i] ?? (withIcon ? fill : null) }));
}

// Gancho, resumen y cierre usan la etiqueta de su momento; el resto, la del tipo de diapositiva
// (así no se repite "Concepto clave" en medio video).
const MOMENT_TYPES = new Set(['hook', 'summary', 'conclusion']);
export function eyebrow(data: SlideTemplateData, fallback: string): string {
  const type = data.scene.scene_type ?? '';
  return MOMENT_TYPES.has(type) ? EYEBROWS[type] : fallback || EYEBROWS[type] || 'Concepto clave';
}

export function labelSize(texts: string[], max: number, min: number): number {
  const longest = Math.max(...texts.map((t) => t.length), 1);
  if (longest <= 18) return max;
  if (longest <= 32) return Math.round(max * 0.86);
  if (longest <= 50) return Math.round(max * 0.74);
  return min;
}

/** Icono dentro de un chip de color; si no hay icono, el número del elemento. */
export function iconChip(icon: string | null, index: number, size: number, color: string, bg: string): string {
  const svg = iconSvg(icon, Math.round(size * 0.5), color, 2.2);
  const inner = svg || `<span style="font-family:'Nunito',sans-serif;font-weight:900;font-size:${Math.round(size * 0.42)}px;color:${color}">${index + 1}</span>`;
  return `<div style="width:${size}px;height:${size}px;min-width:${size}px;border-radius:${Math.round(size * 0.3)}px;background:${bg};display:flex;align-items:center;justify-content:center">${inner}</div>`;
}

// ─── Tarjetas con iconos (2–6 ideas) ─────────────────────────────────────────

export function buildIconCardsTemplate(data: SlideTemplateData): string {
  const { brand } = data;
  const items = sceneItems(data, 6);
  const n = Math.max(items.length, 1);
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  const fontSize = labelSize(items.map((i) => i.text), n <= 3 ? 46 : 40, 32);
  const vertical = n <= 3;

  const cards = items.map((it, i) => `
    <div class="card ${vertical ? 'v' : 'h'}" data-reveal="${i + 1}">
      ${iconChip(it.icon, i, vertical ? 112 : 88, brand.primaryColor, alpha(brand.secondaryColor, 0.16))}
      <div class="card-text" style="font-size:${fontSize}px">${escape(it.text)}</div>
    </div>`).join('');

  const css = `
.grid { position:absolute; left:110px; right:110px; top:40px; bottom:40px; display:grid;
  grid-template-columns:repeat(${cols}, 1fr); gap:36px; align-content:center; }
.card { background:#fff; border-radius:28px; box-shadow:0 18px 50px ${alpha(brand.primaryColor, 0.10)}, 0 2px 6px rgba(0,0,0,0.04);
  border:1px solid ${alpha(brand.primaryColor, 0.06)}; display:flex; gap:28px; }
.card.v { flex-direction:column; align-items:flex-start; justify-content:center; padding:48px 44px; min-height:300px; }
.card.h { flex-direction:row; align-items:center; padding:32px 40px; }
.card-text { font-weight:600; line-height:1.3; color:#1B1E24; }`;

  return editorialPage({
    brand, eyebrow: eyebrow(data, 'Ideas clave'), title: data.scene.title ?? '', css,
    body: `<div class="grid">${cards}</div>`, timeline: data.timeline,
  });
}

// ─── Ciclo (3–6 etapas que se repiten) ───────────────────────────────────────

export function buildCycleTemplate(data: SlideTemplateData): string {
  const { brand } = data;
  const items = sceneItems(data, 6);
  const n = Math.max(items.length, 3);
  const cx = 960, cy = 395, rx = 470, ry = 268, node = 128;
  const fontSize = labelSize(items.map((i) => i.text), 36, 28);
  const angle = (i: number): number => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const pt = (a: number): [number, number] => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  // Las flechas casi tocan los nodos (antes empezaban ~70 px lejos)
  const gap = Math.min(0.3, (Math.PI / n) * 0.36);

  const arcs = items.map((_, i) => {
    const [x1, y1] = pt(angle(i) + gap);
    const [x2, y2] = pt(angle(i + 1) - gap);
    // El conector que llega al nodo i+1 se dibuja junto con ese nodo (el último cierra el ciclo)
    const to = ((i + 1) % items.length) + 1;
    const reveal = to === 1 ? items.length : to;
    // La punta de flecha va en un trazo aparte de 1° que aparece al terminar de dibujarse el arco
    const [xa, ya] = pt(angle(i + 1) - gap - 0.02);
    return `<path data-draw="${reveal}" d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rx} ${ry} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}"
      fill="none" stroke="${alpha(brand.secondaryColor, 0.75)}" stroke-width="6" stroke-linecap="round"/>
      <path data-fade="${reveal}" d="M ${xa.toFixed(1)} ${ya.toFixed(1)} A ${rx} ${ry} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}"
      fill="none" stroke="${alpha(brand.secondaryColor, 0.75)}" stroke-width="6" marker-end="url(#arrow)"/>`;
  }).join('');

  const nodes = items.map((it, i) => {
    const [x, y] = pt(angle(i));
    return `
    <div class="node" data-reveal="${i + 1}" style="left:${(x - 170).toFixed(0)}px;top:${(y - node / 2).toFixed(0)}px">
      <div class="disc">${iconSvg(it.icon, 58, brand.primaryColor, 2.2) || `<span class="num">${i + 1}</span>`}</div>
      <div class="label" style="font-size:${fontSize}px">${escape(it.text)}</div>
    </div>`;
  }).join('');

  const css = `
.diagram { position:absolute; inset:0; }
.diagram > svg { position:absolute; inset:0; overflow:visible; }
.node { position:absolute; width:340px; display:flex; flex-direction:column; align-items:center; gap:14px; }
.disc { width:${node}px; height:${node}px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center;
  box-shadow:0 14px 40px ${alpha(brand.primaryColor, 0.16)}; border:4px solid ${alpha(brand.secondaryColor, 0.35)}; }
.num { font-family:'Nunito',sans-serif; font-weight:900; font-size:52px; color:${brand.primaryColor}; }
.label { background:#fff; border-radius:16px; padding:10px 22px; font-weight:700; color:#1B1E24; text-align:center; line-height:1.25;
  box-shadow:0 6px 20px rgba(0,0,0,0.06); max-width:340px; }
.hub { position:absolute; left:${cx - 90}px; top:${cy - 90}px; width:180px; height:180px; border-radius:50%;
  background:${alpha(brand.secondaryColor, 0.10)}; display:flex; align-items:center; justify-content:center; }`;

  const body = `<div class="diagram">
    <svg width="1920" height="766" viewBox="0 0 1920 766">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${alpha(brand.secondaryColor, 0.9)}"/></marker></defs>
      ${arcs}
    </svg>
    <div class="hub" data-anim="enter">${iconSvg('refresh-cw', 84, alpha(brand.secondaryColor, 0.8), 1.8)}</div>
    ${nodes}
  </div>`;

  return editorialPage({ brand, eyebrow: eyebrow(data, 'El ciclo'), title: data.scene.title ?? '', css, body, timeline: data.timeline });
}

// ─── Mapa de conceptos (concepto central + 2–6 ramas) ────────────────────────

export function buildConceptMapTemplate(data: SlideTemplateData): string {
  const { brand, scene } = data;
  const items = sceneItems(data, 6);
  // Concepto central: highlight_words[0] salvo que sea una de las ramas; si no, el título
  const hw = (scene.highlight_words?.[0] ?? '').trim();
  const isBranch = hw && items.some((it) => it.text.toLowerCase().includes(hw.toLowerCase()));
  const center = (hw && !isBranch ? hw : scene.title ?? '').trim();
  const cx = 960, cy = 383;
  const left = items.filter((_, i) => i % 2 === 0);
  const right = items.filter((_, i) => i % 2 === 1);
  const fontSize = labelSize(items.map((i) => i.text), 36, 28);
  const cardW = 500, cardH = 132;

  const place = (col: typeof items, side: 'l' | 'r'): Array<{ x: number; y: number; it: (typeof items)[number]; idx: number }> => {
    const k = col.length;
    const spacing = k <= 1 ? 0 : Math.min(230, 640 / (k - 1));
    return col.map((it, j) => ({
      x: side === 'l' ? 110 : 1920 - 110 - cardW,
      y: cy + (j - (k - 1) / 2) * spacing - cardH / 2,
      it,
      idx: items.indexOf(it),
    }));
  };
  const placed = [...place(left, 'l'), ...place(right, 'r')];

  const lines = placed.map(({ x, y, idx }) => {
    const leftSide = x < cx;
    const ex = leftSide ? x + cardW : x;
    const ey = y + cardH / 2;
    const sx = leftSide ? cx - 190 : cx + 190;
    const mx = (sx + ex) / 2;
    return `<path data-draw="${idx + 1}" d="M ${sx} ${cy} C ${mx} ${cy}, ${mx} ${ey}, ${ex} ${ey}"
      fill="none" stroke="${alpha(brand.secondaryColor, 0.6)}" stroke-width="5" stroke-linecap="round"/>`;
  }).join('');

  const cards = placed.map(({ x, y, it, idx }) => `
    <div class="branch" data-reveal="${idx + 1}" style="left:${x}px;top:${y.toFixed(0)}px">
      ${iconChip(it.icon, idx, 76, brand.primaryColor, alpha(brand.secondaryColor, 0.16))}
      <div class="branch-text" style="font-size:${fontSize}px">${escape(it.text)}</div>
    </div>`).join('');

  const css = `
.map { position:absolute; inset:0; }
.map > svg { position:absolute; inset:0; overflow:visible; }
.core { position:absolute; left:${cx - 190}px; top:${cy - 100}px; width:380px; height:200px; border-radius:36px;
  background:linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor}); color:#fff; display:flex; align-items:center;
  justify-content:center; text-align:center; padding:24px 32px; font-family:'Nunito',sans-serif; font-weight:900; font-size:${center.length > 24 ? 34 : 42}px;
  line-height:1.1; box-shadow:0 24px 60px ${alpha(brand.primaryColor, 0.30)}; }
.branch { position:absolute; width:${cardW}px; height:${cardH}px; background:#fff; border-radius:24px; display:flex; align-items:center;
  gap:22px; padding:0 28px; box-shadow:0 14px 40px ${alpha(brand.primaryColor, 0.10)}; border:1px solid ${alpha(brand.primaryColor, 0.06)}; }
.branch-text { font-weight:600; line-height:1.25; color:#1B1E24; }`;

  const body = `<div class="map">
    <svg width="1920" height="766" viewBox="0 0 1920 766">${lines}</svg>
    <div class="core" data-anim="enter">${escape(center)}</div>
    ${cards}
  </div>`;

  return editorialPage({ brand, eyebrow: eyebrow(data, 'Mapa de ideas'), title: scene.title ?? '', css, body, timeline: data.timeline });
}

// ─── Línea de tiempo (3–6 hitos; "1990: evento" separa fecha y texto) ────────

export function buildTimelineTemplate(data: SlideTemplateData): string {
  const { brand } = data;
  const items = sceneItems(data, 6);
  const n = Math.max(items.length, 1);
  const ly = 383;
  const boxW0 = n <= 3 ? 420 : n === 4 ? 360 : 300;
  // Las etiquetas (centradas en cada hito) no deben salirse de los márgenes de 110 px
  const x0 = 110 + boxW0 / 2, x1 = 1920 - 110 - boxW0 / 2;
  const step = n === 1 ? 0 : (x1 - x0) / (n - 1);
  const parsed = items.map((it) => {
    const m = it.text.match(/^\s*([^:]{1,24}):\s*(.+)$/);
    return { ...it, date: m ? m[1].trim() : '', label: m ? m[2].trim() : it.text };
  });
  const fontSize = labelSize(parsed.map((p) => p.label), 34, 26);
  const boxW = boxW0;

  const segments = parsed.slice(1).map((_, i) => {
    const xa = x0 + step * i + 60, xb = x0 + step * (i + 1) - 60;
    return `<path data-draw="${i + 2}" d="M ${xa} ${ly} L ${xb} ${ly}" stroke="${alpha(brand.secondaryColor, 0.7)}" stroke-width="6" stroke-linecap="round" fill="none"/>`;
  }).join('');

  const points = parsed.map((p, i) => {
    const x = x0 + step * i;
    const up = i % 2 === 0;
    return `
    <div class="pt" data-reveal="${i + 1}" style="left:${x - 54}px;top:${ly - 54}px">
      ${iconSvg(p.icon, 46, '#fff', 2.2) || `<span class="num">${i + 1}</span>`}
    </div>
    <div class="ev ${up ? 'up' : 'down'}" data-reveal="${i + 1}" style="left:${(x - boxW / 2).toFixed(0)}px;width:${boxW.toFixed(0)}px">
      ${p.date ? `<div class="date">${escape(p.date)}</div>` : ''}
      <div class="ev-text" style="font-size:${fontSize}px">${escape(p.label)}</div>
    </div>`;
  }).join('');

  const css = `
.tl { position:absolute; inset:0; }
.tl > svg { position:absolute; inset:0; overflow:visible; }
.pt { position:absolute; width:108px; height:108px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor}); box-shadow:0 12px 34px ${alpha(brand.primaryColor, 0.28)};
  border:6px solid #fff; }
.num { font-family:'Nunito',sans-serif; font-weight:900; font-size:42px; color:#fff; }
.ev { position:absolute; text-align:center; display:flex; flex-direction:column; gap:8px; align-items:center; }
.ev.up { bottom:${766 - ly + 80}px; }
.ev.down { top:${ly + 80}px; }
.date { font-family:'Nunito',sans-serif; font-weight:900; font-size:46px; color:${brand.secondaryColor}; }
.ev-text { font-weight:600; line-height:1.3; color:#1B1E24; }`;

  const body = `<div class="tl">
    <svg width="1920" height="766" viewBox="0 0 1920 766">${segments}</svg>
    ${points}
  </div>`;

  return editorialPage({ brand, eyebrow: eyebrow(data, 'Línea de tiempo'), title: data.scene.title ?? '', css, body, timeline: data.timeline });
}
