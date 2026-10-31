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
  const fontSize = labelSize(items.map((i) => i.text), 42, 32);
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
.photo { width:${imageW}px; height:640px; flex-shrink:0; border-radius:36px; overflow:hidden;
  box-shadow:0 30px 70px ${alpha(brand.primaryColor, 0.22)}; }
.photo img { width:100%; height:100%; object-fit:cover; object-position:center 35%; display:block; }`;

  const body = `<div class="split">
    <div class="rows">${rows}</div>
    <div class="photo" data-anim="image"><img src="data:image/png;base64,${imageBase64}" alt=""></div>
  </div>`;

  return editorialPage({ brand, eyebrow: eyebrow(data, ''), title: scene.title ?? '', css, body, timeline: data.timeline });
}

// ─── Pasos (process_steps) ───────────────────────────────────────────────────

export function buildStepsEditorialTemplate(data: SlideTemplateData): string {
  const { brand } = data;
  const items = sceneItems(data, 6);
  const n = Math.max(items.length, 1);
  const horizontal = n <= 5;
  const fontSize = labelSize(items.map((i) => i.text), horizontal ? 40 : 42, 32);

  if (horizontal) {
    const cardW = Math.min(400, Math.floor((1700 - (n - 1) * 36) / n));
    const totalW = n * cardW + (n - 1) * 40;
    const x0 = (1920 - totalW) / 2;
    const lineY = 150;
    const segments = items.slice(1).map((_, i) => {
      const xa = x0 + i * (cardW + 40) + cardW / 2 + 52;
      const xb = x0 + (i + 1) * (cardW + 40) + cardW / 2 - 52;
      return `<path data-draw="${i + 2}" d="M ${xa} ${lineY} L ${xb} ${lineY}" stroke="${alpha(brand.secondaryColor, 0.6)}"
        stroke-width="5" stroke-dasharray="2 12" stroke-linecap="round" fill="none"/>`;
    }).join('');
    const cardFont = n >= 5 ? Math.min(fontSize, 34) : fontSize;
    const cards = items.map((it, i) => `
      <div class="step" data-reveal="${i + 1}" style="left:${x0 + i * (cardW + 40)}px;width:${cardW}px">
        <div class="badge">${i + 1}</div>
        <div class="step-card">
          ${iconSvg(it.icon, 56, brand.secondaryColor, 2) ? `<div class="step-icon">${iconSvg(it.icon, 56, brand.secondaryColor, 2)}</div>` : ''}
          <div class="step-text" style="font-size:${cardFont}px">${escape(it.text)}</div>
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
      timeline: data.timeline, ghost: true,
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
  const fontSize = labelSize(items.map((i) => i.text), few ? 46 : 38, 30);

  // Un mito se diferencia en un tono cálido; la realidad conserva el color de la marca
  const isMyth = /^mito/i.test(labelA);
  const colorA = isMyth ? '#C2513F' : brand.primaryColor;
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
.cmpwrap { position:absolute; left:110px; right:110px; top:0; bottom:0; display:flex; gap:150px; align-items:center; }
.col { flex:1; display:flex; flex-direction:column; background:#fff; border-radius:32px; overflow:hidden; min-height:380px;
  box-shadow:0 18px 50px ${alpha(brand.primaryColor, 0.10)}; }
.col-head { color:#fff; font-family:'Nunito',sans-serif; font-weight:900; font-size:${labelA.length + labelB.length > 30 ? 34 : 42}px;
  padding:30px 44px; min-height:116px; display:flex; align-items:center; }
.col-body { flex:1; display:flex; flex-direction:column; justify-content:${few ? 'center' : 'flex-start'}; gap:24px; padding:36px 44px; }
.cmp { display:flex; align-items:center; gap:24px; }
.cmp-text { font-weight:600; line-height:1.3; color:#1B1E24; }
.vs { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:110px; height:110px; border-radius:50%;
  background:#fff; color:${brand.primaryColor}; display:flex; align-items:center; justify-content:center; font-family:'Nunito',sans-serif;
  font-weight:900; font-size:36px; box-shadow:0 14px 34px ${alpha(brand.primaryColor, 0.20)}; z-index:2; }`;

  const body = `<div class="cmpwrap">
    ${column(left, 0, colorA, labelA, 'a')}
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
  const fontSize = labelSize(items.map((i) => i.text), cols === 1 ? 46 : 40, 32);
  const check = iconSvg('circle-check', 44, '#fff', 2.4);

  const cards = items.map((it, i) => `
    <div class="sum" data-reveal="${i + 1}">
      <div class="tick">${check}</div>
      <div class="sum-text" style="font-size:${fontSize}px">${escape(it.text)}</div>
    </div>`).join('');

  const css = `
.sumgrid { position:absolute; left:${cols === 1 ? 260 : 110}px; right:${cols === 1 ? 260 : 110}px; top:10px; bottom:40px; display:grid;
  grid-template-columns:repeat(${cols}, 1fr); gap:28px 40px; align-content:center; }
.sum { display:flex; align-items:center; gap:28px; background:#fff; border-radius:26px; padding:36px 40px; min-height:130px;
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

// ─── Portada (cover) ─────────────────────────────────────────────────────────

export function buildCoverTemplate(data: SlideTemplateData): string {
  const { brand, scene, imageBase64, requiresAiImage } = data;
  const items = sceneItems(data, 3);
  const hasImage = requiresAiImage && !!imageBase64;
  const title = scene.title ?? '';
  const size = title.length <= 24 ? 104 : title.length <= 40 ? 88 : title.length <= 60 ? 72 : 60;

  const css = `
.cover-art { position:absolute; top:0; right:0; bottom:0; width:${hasImage ? 1060 : 860}px; z-index:0; }
.cover-art img { width:100%; height:100%; object-fit:cover; display:block; }
.cover-art::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg, #F6F7F9 0%, rgba(246,247,249,0.85) 18%, rgba(246,247,249,0) 48%); }
.cover-orb { position:absolute; right:150px; top:190px; width:560px; height:560px; border-radius:50%; display:flex; align-items:center;
  justify-content:center; background:linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor});
  box-shadow:0 40px 100px ${alpha(brand.primaryColor, 0.35)}; }
.cover-text { position:absolute; left:110px; top:0; bottom:170px; width:${hasImage ? 980 : 1040}px; display:flex; flex-direction:column;
  justify-content:center; gap:30px; z-index:1; }
.kicker { display:inline-flex; align-self:flex-start; align-items:center; gap:12px; padding:12px 26px; border-radius:40px;
  background:${alpha(brand.secondaryColor, 0.14)}; color:${brand.primaryColor}; font-weight:700; font-size:24px; letter-spacing:2px; text-transform:uppercase; }
.cover-title { font-family:'Nunito',sans-serif; font-weight:900; color:${brand.primaryColor}; line-height:1.0; letter-spacing:-1px; font-size:${size}px; }
.cover-sub { display:flex; flex-direction:column; gap:14px; }
.cover-sub div { font-size:34px; font-weight:600; color:#3A404A; padding-left:26px; border-left:5px solid ${brand.secondaryColor}; }`;

  const art = hasImage
    ? `<div class="cover-art" data-anim="image"><img src="data:image/png;base64,${imageBase64}" alt=""></div>`
    : `<div class="cover-orb" data-anim="image">${iconSvg(items[0]?.icon ?? 'graduation-cap', 260, '#fff', 1.4) || iconSvg('graduation-cap', 260, '#fff', 1.4)}</div>`;

  const body = `${art}
    <div class="cover-text">
      <div class="kicker" data-anim="enter">${escape(brand.institutionName)}</div>
      <div class="cover-title" data-anim="enter">${escape(title)}</div>
      <div class="cover-sub">${items.map((it, i) => `<div data-reveal="${i + 1}">${escape(it.text)}</div>`).join('')}</div>
    </div>`;
  // La portada usa todo el lienzo: sin encabezado y con el escenario a pantalla completa
  return editorialPage({ brand, eyebrow: '', title: '', css: `${css}\n.stage { top:0; bottom:0; }`, body, timeline: data.timeline });
}

// ─── Pregunta guía (guiding_question) ────────────────────────────────────────

export function buildQuestionEditorialTemplate(data: SlideTemplateData): string {
  const { brand, scene, imageBase64, requiresAiImage } = data;
  const hint = sceneItems(data, 1)[0];
  const hasImage = requiresAiImage && !!imageBase64;
  const q = scene.title ?? '';
  const size = q.length <= 40 ? 88 : q.length <= 70 ? 72 : 58;

  const css = `
.qwrap { position:absolute; inset:0; display:flex; align-items:center; padding:0 110px; gap:80px; }
.qtext { flex:1; display:flex; flex-direction:column; gap:40px; position:relative; z-index:1; }
.question { font-family:'Nunito',sans-serif; font-weight:900; color:${brand.primaryColor}; line-height:1.05; letter-spacing:-0.5px; font-size:${size}px; }
.hint { display:flex; align-items:center; gap:22px; align-self:flex-start; background:#fff; border-radius:24px; padding:24px 34px;
  font-size:34px; font-weight:600; color:#2A2F38; box-shadow:0 14px 40px ${alpha(brand.primaryColor, 0.10)}; }
.big-q { position:absolute; right:60px; top:-40px; font-family:'Nunito',sans-serif; font-weight:900; font-size:900px; line-height:1;
  color:${alpha(brand.secondaryColor, 0.10)}; z-index:0; }
.qimg { width:720px; height:620px; flex-shrink:0; border-radius:36px; overflow:hidden; box-shadow:0 30px 70px ${alpha(brand.primaryColor, 0.22)}; z-index:1; }
.qimg img { width:100%; height:100%; object-fit:cover; display:block; }`;

  const body = `${hasImage ? '' : '<div class="big-q" data-anim="image">?</div>'}
    <div class="qwrap">
      <div class="qtext">
        <div class="kicker-q" style="font-weight:700;font-size:24px;letter-spacing:3px;text-transform:uppercase;color:${brand.secondaryColor}" data-anim="enter">Pregunta clave</div>
        <div class="question" data-anim="enter">${escape(q)}</div>
        ${hint ? `<div class="hint" data-reveal="1">${iconSvg(hint.icon ?? 'lightbulb', 44, brand.secondaryColor, 2)}${escape(hint.text)}</div>` : ''}
      </div>
      ${hasImage ? `<div class="qimg" data-anim="image"><img src="data:image/png;base64,${imageBase64}" alt=""></div>` : ''}
    </div>`;
  return editorialPage({ brand, eyebrow: '', title: '', css: `${css}\n.stage { top:0; bottom:170px; }`, body, timeline: data.timeline });
}

// ─── Dato clave (big_stat): on_screen_text[0] = "87% de los adultos…" ─────────

export function buildBigStatEditorialTemplate(data: SlideTemplateData): string {
  const { brand, scene } = data;
  const items = sceneItems(data, 4);
  const first = items[0]?.text ?? '';
  const m = first.match(/^([$€+\-]?\s*[0-9][0-9.,]*\s*[%$€kmKMBbx×]?)/);
  const value = m ? m[1].trim() : first.substring(0, 16);
  const label = m ? first.substring(m[0].length).trim() : '';
  const len = value.replace(/\s/g, '').length;
  const numSize = len <= 3 ? 300 : len <= 5 ? 240 : len <= 7 ? 190 : 140;
  const rest = items.slice(1);
  const fontSize = labelSize(rest.map((r) => r.text), 36, 30);

  const css = `
.statwrap { position:absolute; left:110px; right:110px; top:0; bottom:40px; display:flex; align-items:center; gap:90px; }
.stat { flex:1.2; display:flex; flex-direction:column; gap:10px; }
.stat-num { font-family:'Nunito',sans-serif; font-weight:900; line-height:0.9; letter-spacing:-4px; font-size:${numSize}px;
  background:linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor}); -webkit-background-clip:text; background-clip:text; color:transparent; }
.stat-label { font-size:44px; font-weight:700; color:#1B1E24; line-height:1.2; max-width:900px; }
.facts { flex:1; display:flex; flex-direction:column; gap:22px; }
.fact { display:flex; align-items:center; gap:22px; background:#fff; border-radius:24px; padding:24px 30px;
  box-shadow:0 12px 36px ${alpha(brand.primaryColor, 0.08)}; }
.fact-text { font-weight:600; line-height:1.3; color:#1B1E24; }
.donut, .stat-icon { flex:0 0 auto; width:460px; height:460px; display:flex; align-items:center; justify-content:center; }
.stat-icon { border-radius:50%; background:${alpha(brand.secondaryColor, 0.12)}; }`;

  const pct = /%$/.test(value) ? Math.min(100, parseFloat(value.replace(',', '.'))) : NaN;
  const R = 190;
  const C = 2 * Math.PI * R;
  const visual = !rest.length
    ? (Number.isFinite(pct)
      ? `<div class="donut" data-anim="image"><svg width="460" height="460" viewBox="0 0 460 460">
          <circle cx="230" cy="230" r="${R}" fill="none" stroke="${alpha(brand.secondaryColor, 0.15)}" stroke-width="44"/>
          <circle data-draw="1" cx="230" cy="230" r="${R}" fill="none" stroke="${brand.secondaryColor}" stroke-width="44"
            stroke-linecap="round" stroke-dasharray="${(C * pct / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 230 230)"/>
        </svg></div>`
      : `<div class="stat-icon" data-anim="image">${iconSvg(items[0]?.icon ?? 'chart-bar', 220, brand.primaryColor, 1.4)}</div>`)
    : '';
  const body = `<div class="statwrap">
    <div class="stat" data-reveal="1">
      <div class="stat-num">${escape(value)}</div>
      ${label ? `<div class="stat-label">${escape(label)}</div>` : ''}
    </div>
    ${rest.length ? `<div class="facts">${rest.map((it, i) => `
      <div class="fact" data-reveal="${i + 2}">
        ${iconChip(it.icon, i + 1, 64, brand.primaryColor, alpha(brand.secondaryColor, 0.16))}
        <div class="fact-text" style="font-size:${fontSize}px">${escape(it.text)}</div>
      </div>`).join('')}</div>` : visual}
  </div>`;
  return editorialPage({ brand, eyebrow: eyebrow(data, 'Dato clave'), title: scene.title ?? '', css: `${css}
.stat-num { background:linear-gradient(135deg, #ffffff, ${alpha(brand.secondaryColor, 0.9)}); -webkit-background-clip:text; background-clip:text; }
.stat-label { color:#fff; } .fact { background:rgba(255,255,255,0.10); box-shadow:none; } .fact-text { color:#fff; }
.donut circle:first-child { stroke:rgba(255,255,255,0.15); } .stat-icon { background:rgba(255,255,255,0.10); }`,
    body, timeline: data.timeline, variant: 'dark', ghost: true });
}

// ─── Niveles (hierarchy_diagram): escalera ascendente, del primero al último ──

export function buildLevelsEditorialTemplate(data: SlideTemplateData): string {
  const { brand } = data;
  const items = sceneItems(data, 6);
  const n = Math.max(items.length, 1);
  const stepW = Math.floor(1700 / n) - 14;
  const stepH = Math.min(110, Math.floor(560 / n));
  const fontSize = labelSize(items.map((i) => i.text), n <= 4 ? 36 : 32, 26);

  const steps = items.map((it, i) => {
    const h = 150 + stepH * i;
    const x = 110 + i * (stepW + 14);
    const t = n === 1 ? 1 : i / (n - 1);
    return `
    <div class="lvl" data-reveal="${i + 1}" style="left:${x}px;width:${stepW}px;height:${h}px;
      background:linear-gradient(180deg, ${alpha(brand.secondaryColor, 0.75 + 0.25 * t)}, ${alpha(brand.primaryColor, 0.8 + 0.2 * t)})">
      <div class="lvl-icon">${iconSvg(it.icon, 46, '#fff', 2) || `<span>${i + 1}</span>`}</div>
      <div class="lvl-text" style="font-size:${fontSize}px">${escape(it.text)}</div>
    </div>`;
  }).join('');

  const css = `
.lvl { position:absolute; bottom:60px; border-radius:24px 24px 10px 10px; display:flex; flex-direction:column; align-items:center;
  justify-content:flex-start; gap:14px; padding:26px 16px; color:#fff; text-align:center; box-shadow:0 14px 40px ${alpha(brand.primaryColor, 0.18)}; }
.lvl-icon { width:76px; height:76px; border-radius:22px; background:rgba(255,255,255,0.18); display:flex; align-items:center; justify-content:center;
  font-family:'Nunito',sans-serif; font-weight:900; font-size:34px; }
.lvl-text { font-weight:800; line-height:1.2; }`;
  return editorialPage({ brand, eyebrow: eyebrow(data, 'Niveles'), title: data.scene.title ?? '', css, body: steps, timeline: data.timeline, ghost: true });
}

// ─── Práctica (practice_question): pregunta → cuenta regresiva → respuesta ────

export function buildPracticeTemplate(data: SlideTemplateData): string {
  const { brand, scene } = data;
  const items = sceneItems(data, 3);
  // [escenario, pregunta, respuesta] (formato actual) o [pregunta, respuesta] (guiones anteriores)
  const [scenario, question, answer] = items.length >= 3 ? items : [null, items[0], items[1]];
  const r = 92;
  const circ = 2 * Math.PI * r;

  const css = `
.practice { position:absolute; left:160px; right:160px; top:0; bottom:0; display:flex; flex-direction:column; justify-content:center; gap:36px; }
.q-card { display:flex; align-items:center; gap:48px; background:#fff; border-radius:36px; padding:48px 64px; min-height:240px;
  box-shadow:0 18px 50px ${alpha(brand.primaryColor, 0.10)}; border-left:10px solid ${brand.secondaryColor}; }
.q-text { flex:1; font-family:'Nunito',sans-serif; font-weight:900; font-size:${(question?.text.length ?? 0) > 70 ? 54 : 64}px;
  line-height:1.15; color:${brand.primaryColor}; }
.timer { position:relative; width:220px; height:220px; flex-shrink:0; }
.timer > svg { position:absolute; inset:0; transform:rotate(-90deg); }
.timer-label { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
.a-card { display:flex; align-items:center; gap:28px; background:linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor});
  color:#fff; border-radius:32px; padding:44px 56px; box-shadow:0 18px 50px ${alpha(brand.primaryColor, 0.25)}; }
.scenario { display:flex; align-items:center; gap:22px; font-size:38px; font-weight:600; color:#2A2F38;
  background:${alpha(brand.secondaryColor, 0.12)}; border-radius:24px; padding:24px 36px; align-self:flex-start; }
.a-slot { position:relative; }
.a-ghost { display:flex; align-items:center; gap:24px; border:4px dashed ${alpha(brand.primaryColor, 0.25)}; border-radius:32px;
  padding:44px 56px; font-size:44px; font-weight:700; color:${alpha(brand.primaryColor, 0.45)}; }
.a-slot .a-card { position:absolute; inset:0; }
.a-label { font-weight:800; font-size:24px; letter-spacing:3px; text-transform:uppercase; opacity:0.85; white-space:nowrap; }
.a-text { font-size:54px; font-weight:800; line-height:1.2; }`;

  const body = `<div class="practice">
    ${scenario ? `<div class="scenario" data-anim="enter">${iconSvg(scenario.icon ?? 'user', 52, brand.secondaryColor, 2)}<span>${escape(scenario.text)}</span></div>` : ''}
    <div class="q-card" data-anim="enter">
      <div class="q-text">${escape(question?.text ?? scene.title ?? '')}</div>
      <div class="timer">
        <svg width="220" height="220" viewBox="0 0 220 220">
          <circle cx="110" cy="110" r="${r}" fill="none" stroke="${alpha(brand.secondaryColor, 0.18)}" stroke-width="16"/>
          <circle data-countdown="${scenario ? 2 : 1}" cx="110" cy="110" r="${r}" fill="none" stroke="${brand.secondaryColor}" stroke-width="12"
            stroke-width="16" stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="0"/>
        </svg>
        <div class="timer-label">${iconSvg('timer', 84, brand.primaryColor, 2)}</div>
      </div>
    </div>
    ${answer ? `<div class="a-slot" data-countdown-end><div class="a-ghost">${iconSvg('circle-help', 56, alpha(brand.primaryColor, 0.45), 2)}<span>Piensa tu respuesta…</span></div><div class="a-card" data-reveal="${scenario ? 3 : 2}">${iconSvg('circle-check', 60, '#fff', 2.2)}<div class="a-label">Respuesta</div><div class="a-text">${escape(answer.text)}</div></div></div>` : ''}
  </div>`;
  // El título no repite la pregunta (que ya ocupa la tarjeta principal)
  const title = scene.title && scene.title.trim() !== (question?.text ?? '').trim() && !/ponte a prueba/i.test(scene.title)
    ? scene.title : 'Aplica lo aprendido';
  return editorialPage({ brand, eyebrow: 'Práctica', title, css, body, timeline: data.timeline, ghost: false });
}
