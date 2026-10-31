import { SlideTemplateData } from '../slides.service';
import { escape, highlighted } from './shared';
import { alpha, editorialPage } from './editorial';
import { iconSvg } from './icons';
import { eyebrow, iconChip, labelSize, sceneItems } from './diagrams.template';

// Rediseño editorial de los layouts más usados: imagen + texto, pasos, comparación,
// resumen y cierre. Mismo lenguaje visual que los diagramas (encabezado grande, iconos,
// tarjetas blancas con sombra suave) y los mismos data-reveal para la animación.

// ─── Imagen + ideas (content_split / real_example con imagen) ────────────────

export function buildSplitTemplate(data: SlideTemplateData, imageFirst = false): string {
  const { brand, scene, imageBase64 } = data;
  const items = sceneItems(data, 5);
  const highlights = scene.highlight_words ?? [];
  const fontSize = labelSize(items.map((i) => i.text), 38, 26);
  const imageW = imageFirst ? 980 : 840;

  const rows = items.map((it, i) => `
    <div class="row" data-reveal="${i + 1}">
      ${iconChip(it.icon, i, 72, brand.primaryColor, alpha(brand.secondaryColor, 0.16))}
      <div class="row-text" style="font-size:${fontSize}px">${highlighted(it.text, highlights, brand.secondaryColor)}</div>
    </div>`).join('');

  const css = `
.split { position:absolute; left:110px; right:110px; top:10px; bottom:30px; display:flex; gap:64px; align-items:center;
  flex-direction:${imageFirst ? 'row-reverse' : 'row'}; }
.rows { flex:1; display:flex; flex-direction:column; gap:22px; justify-content:center; min-width:0; }
.row { display:flex; align-items:center; gap:26px; background:#fff; border-radius:24px; padding:22px 30px;
  box-shadow:0 12px 36px ${alpha(brand.primaryColor, 0.08)}; border:1px solid ${alpha(brand.primaryColor, 0.05)}; }
.row-text { font-weight:600; line-height:1.3; color:#1B1E24; }
.row-text mark { background:#FFE500; padding:0 8px; border-radius:6px; }
.photo { width:${imageW}px; height:640px; flex-shrink:0; border-radius:36px; overflow:hidden;
  box-shadow:0 30px 70px ${alpha(brand.primaryColor, 0.22)}; }
.photo img { width:100%; height:100%; object-fit:cover; display:block; }`;

  const body = `<div class="split">
    <div class="rows">${rows}</div>
    <div class="photo" data-anim="image"><img src="data:image/png;base64,${imageBase64}" alt=""></div>
  </div>`;

  return editorialPage({ brand, eyebrow: eyebrow(data, 'Concepto clave'), title: scene.title ?? '', css, body, timeline: data.timeline });
}

// ─── Pasos (process_steps) ───────────────────────────────────────────────────

export function buildStepsEditorialTemplate(data: SlideTemplateData): string {
  const { brand } = data;
  const items = sceneItems(data, 6);
  const n = Math.max(items.length, 1);
  const horizontal = n <= 4;
  const fontSize = labelSize(items.map((i) => i.text), horizontal ? 36 : 38, 28);

  if (horizontal) {
    const cardW = Math.min(400, Math.floor((1700 - (n - 1) * 40) / n));
    const totalW = n * cardW + (n - 1) * 40;
    const x0 = (1920 - totalW) / 2;
    const lineY = 150;
    const segments = items.slice(1).map((_, i) => {
      const xa = x0 + i * (cardW + 40) + cardW / 2 + 52;
      const xb = x0 + (i + 1) * (cardW + 40) + cardW / 2 - 52;
      return `<path data-draw="${i + 2}" d="M ${xa} ${lineY} L ${xb} ${lineY}" stroke="${alpha(brand.secondaryColor, 0.6)}"
        stroke-width="5" stroke-dasharray="2 12" stroke-linecap="round" fill="none"/>`;
    }).join('');
    const cards = items.map((it, i) => `
      <div class="step" data-reveal="${i + 1}" style="left:${x0 + i * (cardW + 40)}px;width:${cardW}px">
        <div class="badge">${i + 1}</div>
        <div class="step-card">
          ${iconSvg(it.icon, 56, brand.secondaryColor, 2) ? `<div class="step-icon">${iconSvg(it.icon, 56, brand.secondaryColor, 2)}</div>` : ''}
          <div class="step-text" style="font-size:${fontSize}px">${escape(it.text)}</div>
        </div>
      </div>`).join('');
    const css = `
.steps { position:absolute; inset:0; }
.steps > svg { position:absolute; inset:0; overflow:visible; }
.step { position:absolute; top:${lineY - 52}px; display:flex; flex-direction:column; align-items:center; gap:28px; }
.badge { width:104px; height:104px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor}); color:#fff; font-family:'Nunito',sans-serif;
  font-weight:900; font-size:46px; box-shadow:0 14px 34px ${alpha(brand.primaryColor, 0.28)}; border:6px solid #fff; }
.step-card { width:100%; min-height:300px; background:#fff; border-radius:28px; padding:40px 34px; display:flex; flex-direction:column;
  align-items:center; text-align:center; gap:22px; box-shadow:0 18px 50px ${alpha(brand.primaryColor, 0.10)}; }
.step-text { font-weight:700; line-height:1.3; color:#1B1E24; }`;
    return editorialPage({
      brand, eyebrow: eyebrow(data, 'Paso a paso'), title: data.scene.title ?? '', css,
      body: `<div class="steps"><svg width="1920" height="766" viewBox="0 0 1920 766">${segments}</svg>${cards}</div>`,
      timeline: data.timeline,
    });
  }

  // 5–6 pasos: lista vertical en dos columnas con número + icono
  const half = Math.ceil(n / 2);
  const col = (list: typeof items, offset: number): string => list.map((it, j) => `
    <div class="vstep" data-reveal="${offset + j + 1}">
      <div class="vbadge">${offset + j + 1}</div>
      ${iconSvg(it.icon, 44, brand.secondaryColor, 2)}
      <div class="step-text" style="font-size:${fontSize}px">${escape(it.text)}</div>
    </div>`).join('');
  const css = `
.vgrid { position:absolute; left:110px; right:110px; top:20px; bottom:40px; display:grid; grid-template-columns:1fr 1fr;
  gap:28px 48px; align-content:center; }
.vcol { display:flex; flex-direction:column; gap:28px; }
.vstep { display:flex; align-items:center; gap:24px; background:#fff; border-radius:24px; padding:26px 30px;
  box-shadow:0 12px 36px ${alpha(brand.primaryColor, 0.08)}; }
.vbadge { width:64px; height:64px; min-width:64px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor}); color:#fff; font-family:'Nunito',sans-serif;
  font-weight:900; font-size:30px; }
.step-text { font-weight:700; line-height:1.3; color:#1B1E24; }`;
  return editorialPage({
    brand, eyebrow: eyebrow(data, 'Paso a paso'), title: data.scene.title ?? '', css,
    body: `<div class="vgrid"><div class="vcol">${col(items.slice(0, half), 0)}</div><div class="vcol">${col(items.slice(half), half)}</div></div>`,
    timeline: data.timeline,
  });
}

// ─── Comparación (primera mitad = A, segunda mitad = B) ──────────────────────

export function buildComparisonEditorialTemplate(data: SlideTemplateData): string {
  const { brand, scene } = data;
  const items = sceneItems(data, 8);
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);
  const parts = (scene.title ?? '').split(/\s+(?:vs\.?|versus)\s+/i);
  const labelA = parts.length === 2 ? parts[0].trim() : 'A';
  const labelB = parts.length === 2 ? parts[1].trim() : 'B';
  const few = Math.max(left.length, right.length) <= 2;
  const fontSize = labelSize(items.map((i) => i.text), few ? 40 : 32, 24);

  const column = (list: typeof items, offset: number, color: string, label: string, side: 'a' | 'b'): string => `
    <div class="col col-${side}">
      <div class="col-head" data-anim="enter" style="background:${color}">${escape(label)}</div>
      <div class="col-body">
        ${list.map((it, j) => `
          <div class="cmp" data-reveal="${offset + j + 1}">
            ${iconChip(it.icon, offset + j, 64, color, alpha(color, 0.12))}
            <div class="cmp-text" style="font-size:${fontSize}px">${escape(it.text)}</div>
          </div>`).join('')}
      </div>
    </div>`;

  const css = `
.cmpwrap { position:absolute; left:110px; right:110px; top:10px; bottom:40px; display:flex; gap:150px; align-items:stretch; }
.col { flex:1; display:flex; flex-direction:column; background:#fff; border-radius:32px; overflow:hidden;
  box-shadow:0 18px 50px ${alpha(brand.primaryColor, 0.10)}; }
.col-head { color:#fff; font-family:'Nunito',sans-serif; font-weight:900; font-size:${labelA.length + labelB.length > 30 ? 34 : 42}px;
  padding:30px 44px; }
.col-body { flex:1; display:flex; flex-direction:column; justify-content:${few ? 'center' : 'flex-start'}; gap:24px; padding:36px 44px; }
.cmp { display:flex; align-items:center; gap:24px; }
.cmp-text { font-weight:600; line-height:1.3; color:#1B1E24; }
.vs { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:110px; height:110px; border-radius:50%;
  background:#fff; color:${brand.primaryColor}; display:flex; align-items:center; justify-content:center; font-family:'Nunito',sans-serif;
  font-weight:900; font-size:36px; box-shadow:0 14px 34px ${alpha(brand.primaryColor, 0.20)}; z-index:2; }`;

  const body = `<div class="cmpwrap">
    ${column(left, 0, brand.primaryColor, labelA, 'a')}
    ${column(right, left.length, brand.secondaryColor, labelB, 'b')}
    <div class="vs" data-anim="enter">VS</div>
  </div>`;
  return editorialPage({ brand, eyebrow: eyebrow(data, 'Comparación'), title: scene.title ?? '', css, body, timeline: data.timeline });
}

// ─── Resumen (summary_checklist) ─────────────────────────────────────────────

export function buildSummaryEditorialTemplate(data: SlideTemplateData): string {
  const { brand, scene } = data;
  const items = sceneItems(data, 6);
  const n = Math.max(items.length, 1);
  const cols = n <= 3 ? 1 : 2;
  const fontSize = labelSize(items.map((i) => i.text), cols === 1 ? 40 : 34, 26);
  const check = iconSvg('circle-check', 44, '#fff', 2.4);

  const cards = items.map((it, i) => `
    <div class="sum" data-reveal="${i + 1}">
      <div class="tick">${check}</div>
      <div class="sum-text" style="font-size:${fontSize}px">${escape(it.text)}</div>
    </div>`).join('');

  const css = `
.sumgrid { position:absolute; left:${cols === 1 ? 260 : 110}px; right:${cols === 1 ? 260 : 110}px; top:10px; bottom:40px; display:grid;
  grid-template-columns:repeat(${cols}, 1fr); gap:28px 40px; align-content:center; }
.sum { display:flex; align-items:center; gap:28px; background:#fff; border-radius:26px; padding:30px 36px;
  box-shadow:0 14px 40px ${alpha(brand.primaryColor, 0.09)}; }
.tick { width:76px; height:76px; min-width:76px; border-radius:22px; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg, ${brand.secondaryColor}, ${brand.primaryColor}); }
.sum-text { font-weight:700; line-height:1.3; color:#1B1E24; }`;
  return editorialPage({ brand, eyebrow: eyebrow(data, 'En resumen'), title: scene.title ?? '', css, body: `<div class="sumgrid">${cards}</div>`, timeline: data.timeline });
}

// ─── Cierre (conclusion_reflection) ──────────────────────────────────────────

export function buildConclusionEditorialTemplate(data: SlideTemplateData): string {
  const { brand, scene, imageBase64, requiresAiImage } = data;
  const items = sceneItems(data, 4);
  const hasImage = requiresAiImage && !!imageBase64;
  const [lead, ...rest] = items;
  const leadSize = (lead?.text.length ?? 0) > 60 ? 52 : 64;

  const css = `
.close { position:absolute; left:110px; right:110px; top:0; bottom:40px; display:flex; gap:80px; align-items:center; }
.close-text { flex:1; display:flex; flex-direction:column; gap:36px; }
.lead { font-family:'Nunito',sans-serif; font-weight:900; color:#fff; line-height:1.12; font-size:${leadSize}px; }
.lead::before { content:'“'; display:block; font-size:120px; line-height:0.6; opacity:0.35; }
.more { display:flex; flex-direction:column; gap:18px; }
.more div { font-size:34px; font-weight:600; color:rgba(255,255,255,0.88); padding-left:28px; border-left:4px solid ${brand.secondaryColor}; }
.close-img { width:720px; height:620px; flex-shrink:0; border-radius:36px; overflow:hidden; box-shadow:0 30px 80px rgba(0,0,0,0.35); }
.close-img img { width:100%; height:100%; object-fit:cover; display:block; }`;

  const body = `<div class="close">
    <div class="close-text">
      ${lead ? `<div class="lead" data-reveal="1">${escape(lead.text)}</div>` : ''}
      <div class="more">${rest.map((it, i) => `<div data-reveal="${i + 2}">${escape(it.text)}</div>`).join('')}</div>
    </div>
    ${hasImage ? `<div class="close-img" data-anim="image"><img src="data:image/png;base64,${imageBase64}" alt=""></div>` : ''}
  </div>`;
  return editorialPage({
    brand, eyebrow: eyebrow(data, 'Para cerrar'), title: scene.title ?? '', css, body, timeline: data.timeline, variant: 'dark',
  });
}
