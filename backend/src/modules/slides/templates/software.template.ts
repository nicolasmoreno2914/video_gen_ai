import { SlideTemplateData } from '../slides.service';
import { ResolvedUiDemo, UiRender } from '../software/ui-demo';
import { alpha, editorialPage } from './editorial';
import { uiIconSvg as iconSvg } from './icons';
import { escape } from './shared';

// Demostración de software: maqueta fiel (sin logos) del programa, un cursor que hace los pasos
// al ritmo de la voz y la lista de pasos a la derecha. El runtime propio (no Web Animations)
// reconstruye el estado en cualquier instante: seek(t) parte del HTML inicial y aplica los pasos
// ya ocurridos, así la captura por fotogramas clave funciona igual que en el resto de slides.

const CURSOR_MOVE = 0.6; // s que tarda el cursor en llegar al elemento antes del paso
const TYPE_DELAY = 0.15;
const TYPE_CPS = 12; // letras por segundo al escribir (se acelera si el paso siguiente llega antes)
const AFTER_DELAY = 0.35; // efectos que siguen al clic (p. ej. aplicar negrita)

export function buildSoftwareTemplate(data: SlideTemplateData, demo: ResolvedUiDemo, duration: number): string {
  const { brand, scene } = data;
  const times = data.timeline?.revealTimes ?? demo.steps.map((_, i) => 0.8 + i * 2.5);
  const css = `${baseCss(brand.primaryColor, brand.secondaryColor)}\n${appCss(demo.app)}`;
  const steps = demo.steps.map((s, i) => `<li data-step="${i}"><span class="n">${i + 1}</span><span class="t">${escape(s.label)}</span></li>`).join('');
  const body = `<div class="sw-wrap">
  <div class="app app-${demo.app}" id="app">${appHtml(demo.render, demo.title)}</div>
  <div class="steps"><div class="steps-title">${iconSvg('list-checks', 26, brand.secondaryColor)}<span>Paso a paso</span></div><ol>${steps}</ol></div>
</div>`;
  // Cursor y onda de clic fuera de .stage: sus coordenadas son las de la página
  const pointer = `<div id="ripple"></div>
<div id="cursor"><svg width="44" height="44" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.5 L14.4 20.3 L11.4 13.7 L17.8 13.7 Z" fill="#14161A" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div>`;
  const eyebrow = `Tutorial · ${{ spreadsheet: 'Hoja de cálculo', document: 'Documento', email: 'Correo' }[demo.app]}`;
  const html = editorialPage({ brand, eyebrow, title: scene.title ?? '', css, body, timeline: null, ghost: false });
  const runtime = data.timeline ? softwareRuntime(demo, times, duration) : staticState(demo, times);
  return html.replace('</body>', `${pointer}\n${runtime}\n</body>`);
}

function baseCss(p: string, s: string): string {
  return `.stage { top:206px; bottom:150px; }
.header { padding-top:52px; } .scene-title { font-size:56px !important; }
.sw-wrap { position:absolute; inset:0 110px; display:flex; gap:44px; }
.app { position:relative; flex:0 0 1210px; height:100%; background:#fff; border-radius:18px; overflow:hidden;
  box-shadow:0 30px 70px rgba(20,22,26,0.14), 0 0 0 1px rgba(20,22,26,0.08); font-family:'Inter',sans-serif; color:#202124; }
.steps { flex:1; display:flex; flex-direction:column; gap:18px; padding-top:6px; }
.steps-title { display:flex; align-items:center; gap:10px; font-weight:800; font-size:22px; letter-spacing:2px;
  text-transform:uppercase; color:${s}; }
.steps ol { list-style:none; display:flex; flex-direction:column; gap:14px; }
.steps li { display:flex; align-items:flex-start; gap:16px; padding:16px 18px; border-radius:16px; background:#fff;
  box-shadow:0 0 0 1px rgba(20,22,26,0.07); opacity:0.32; transition:none; }
.steps li .n { flex:0 0 40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  background:${alpha(p, 0.10)}; color:${p}; font-weight:800; font-size:21px; }
.steps li .t { font-size:25px; font-weight:600; line-height:1.25; padding-top:5px; text-wrap:balance; }
.steps li.done { opacity:0.62; }
.steps li.done .n { background:${p}; color:#fff; }
.steps li.now { opacity:1; box-shadow:0 0 0 3px ${s}, 0 18px 40px ${alpha(p, 0.16)}; }
.steps li.now .n { background:${s}; color:#fff; }
#cursor { position:absolute; left:0; top:0; z-index:20; opacity:0; filter:drop-shadow(0 3px 4px rgba(0,0,0,0.3)); }
#ripple { position:absolute; z-index:19; width:64px; height:64px; margin:-32px 0 0 -32px; border-radius:50%;
  border:4px solid ${s}; opacity:0; }
.pressed { box-shadow:0 0 0 4px ${s} !important; background:${alpha(s, 0.18)} !important; border-radius:8px; }
.typing::after { content:''; display:inline-block; width:2px; height:1em; background:currentColor; margin-left:2px; vertical-align:-0.12em; }`;
}

function appCss(app: ResolvedUiDemo['app']): string {
  if (app === 'spreadsheet') {
    return `.titlebar { height:46px; background:#1E7145; color:#fff; display:flex; align-items:center; justify-content:center;
  font-size:18px; font-weight:600; position:relative; }
.titlebar .dots { position:absolute; left:18px; display:flex; gap:8px; } .titlebar .dots i { width:12px; height:12px; border-radius:50%; background:rgba(255,255,255,0.45); }
.tabs { height:40px; background:#1E7145; display:flex; align-items:flex-end; gap:4px; padding:0 14px; }
.tab { padding:8px 15px; font-size:18px; color:rgba(255,255,255,0.88); border-radius:6px 6px 0 0; }
.tab.on { background:#F3F3F3; color:#1E7145; font-weight:700; }
.ribbon { height:84px; background:#F3F3F3; border-bottom:1px solid #D6D6D6; display:flex; align-items:center; gap:6px; padding:0 14px; }
.rb { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; min-width:64px; height:70px; padding:0 8px;
  font-size:15px; color:#333; border-radius:8px; }
.rb .g { font-size:26px; font-weight:800; line-height:1; color:#222; font-family:Georgia,serif; }
.rb.sm .g { font-family:'Inter',sans-serif; }
.sep { width:1px; height:56px; background:#D6D6D6; margin:0 6px; }
.fxbar { height:48px; display:flex; align-items:center; gap:12px; padding:0 12px; border-bottom:1px solid #D6D6D6; font-size:20px; }
#namebox { width:96px; height:34px; border:1px solid #C8C8C8; display:flex; align-items:center; padding-left:10px; font-weight:600; }
#fx { flex:1; display:flex; align-items:center; gap:14px; height:34px; border:1px solid #C8C8C8; padding-left:12px; }
#fx .fx { font-style:italic; color:#777; font-family:Georgia,serif; font-weight:700; }
#fx .val { font-family:'Inter',sans-serif; }
.grid { display:grid; grid-template-columns:56px repeat(6, 1fr); grid-auto-rows:39px; font-size:21px; }
.hd { background:#F3F3F3; color:#555; display:flex; align-items:center; justify-content:center; border-right:1px solid #D6D6D6;
  border-bottom:1px solid #D6D6D6; font-size:17px; }
.cell { border-right:1px solid #E2E2E2; border-bottom:1px solid #E2E2E2; display:flex; align-items:center; padding:0 10px;
  white-space:nowrap; overflow:hidden; position:relative; }
.cell.num { justify-content:flex-end; }
.cell.sel { background:#E3F1E8; }
.cell.active { box-shadow:inset 0 0 0 3px #1E7145; background:#fff; }
.cell.b { font-weight:800; } .cell.i { font-style:italic; } .cell.u .v { text-decoration:underline; }
.cell.merged { justify-content:center; }`;
  }
  if (app === 'document') {
    return `.titlebar { height:64px; display:flex; align-items:center; gap:14px; padding:0 18px; border-bottom:1px solid #E5E5E5; }
.doc-icon { width:30px; height:38px; border-radius:4px; background:#4285F4; position:relative; }
.doc-icon::after { content:''; position:absolute; left:7px; right:7px; top:12px; height:14px;
  background:repeating-linear-gradient(#fff 0 2px, transparent 2px 6px); }
.doc-name { font-size:22px; font-weight:500; }
.menus { display:flex; gap:18px; font-size:18px; color:#444; margin-left:auto; padding-right:8px; }
.menus span { padding:4px 6px; border-radius:6px; }
.toolbar { height:56px; display:flex; align-items:center; gap:4px; padding:0 14px; background:#EDF2FA; border-radius:28px; margin:10px 14px; }
.tb { height:44px; min-width:44px; display:flex; align-items:center; justify-content:center; border-radius:8px; padding:0 8px; color:#444; font-size:19px; }
#style-btn { min-width:190px; justify-content:space-between; gap:10px; background:#fff; border:1px solid #D0D7E2; }
.tsep { width:1px; height:26px; background:#C7CED9; margin:0 8px; }
.page-bg { position:absolute; top:150px; left:0; right:0; bottom:0; background:#F8F9FA; overflow:hidden; }
.page { width:960px; margin:20px auto 0; background:#fff; min-height:560px; box-shadow:0 1px 3px rgba(0,0,0,0.18);
  padding:48px 70px; font-family:Arial,'Inter',sans-serif; font-size:28px; line-height:1.45; }
.page p { margin:0 0 14px; }
.page p[data-style="Título"] { font-size:52px; line-height:1.15; }
.page p[data-style="Subtítulo"] { font-size:31px; color:#666; }
.page p[data-style="Encabezado 1"] { font-size:42px; line-height:1.2; }
.page p[data-style="Encabezado 2"] { font-size:35px; line-height:1.2; }
.page p[data-style="Encabezado 3"] { font-size:31px; color:#434343; font-weight:700; }
.page p[data-align="center"] { text-align:center; }
.page p[data-list] { padding-left:40px; position:relative; }
.page p[data-list="bullet"]::before { content:'●'; position:absolute; left:8px; font-size:15px; top:6px; }
.page p[data-list="number"]::before { content:'1.'; position:absolute; left:4px; }
.seg.sel, .tail.sel { background:#C6DAFC; }
.seg.b, .tail.b { font-weight:700; } .seg.i, .tail.i { font-style:italic; } .seg.u, .tail.u { text-decoration:underline; }
#style-menu { position:absolute; top:128px; left:212px; z-index:5; width:300px; background:#fff; border-radius:10px;
  box-shadow:0 8px 28px rgba(0,0,0,0.22); padding:8px 0; display:none; }
#style-menu div { padding:11px 22px; font-size:21px; }
#style-menu div.hover { background:#E8F0FE; }`;
  }
  return `.mail-top { height:76px; display:flex; align-items:center; gap:20px; padding:0 22px; }
.mail-brand { display:flex; align-items:center; gap:10px; font-size:26px; color:#5f6368; width:240px; }
.mail-brand i { width:34px; height:26px; border-radius:4px; border:3px solid #EA4335; border-top-width:3px; position:relative; }
.search { flex:1; height:50px; border-radius:25px; background:#E9EEF6; display:flex; align-items:center; gap:14px; padding:0 22px; color:#5f6368; font-size:20px; }
.mail-body { position:absolute; top:76px; left:0; right:0; bottom:0; display:flex; }
.side { width:262px; padding:6px 12px; display:flex; flex-direction:column; gap:6px; }
#compose-btn { display:flex; align-items:center; gap:14px; height:64px; width:170px; border-radius:18px; background:#C2E7FF;
  font-size:21px; font-weight:600; padding:0 22px; margin-bottom:12px; color:#001D35; }
.folder { display:flex; align-items:center; gap:16px; height:48px; padding:0 20px; border-radius:0 24px 24px 0; font-size:20px; color:#202124; }
.folder.active { background:#D3E3FD; font-weight:700; }
.folder .count { margin-left:auto; font-size:15px; font-weight:700; }
.list { flex:1; background:#fff; border-radius:16px 0 0 0; margin-right:0; }
.row { display:flex; align-items:center; gap:18px; height:62px; padding:0 22px; border-bottom:1px solid #EFEFEF; font-size:20px; }
.row .from { width:230px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.row .subj { font-weight:600; white-space:nowrap; }
.row .snip { color:#5f6368; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; }
#list-sent { display:none; }
#compose { position:absolute; right:24px; bottom:0; width:700px; height:500px; background:#fff; border-radius:14px 14px 0 0;
  box-shadow:0 10px 36px rgba(0,0,0,0.28); display:none; z-index:4; flex-direction:column; }
#compose.shown { display:flex; }
.c-head { height:50px; background:#F2F6FC; border-radius:14px 14px 0 0; display:flex; align-items:center; padding:0 18px; font-size:20px; font-weight:600; }
.c-field { display:flex; align-items:center; gap:12px; height:56px; margin:0 18px; border-bottom:1px solid #E5E5E5; font-size:22px; }
.c-field .k { color:#5f6368; }
.c-field .cc-link { margin-left:auto; color:#5f6368; font-size:17px; padding:4px 6px; border-radius:6px; }
.c-field[data-field="cc"], .c-field[data-field="cco"] { display:none; }
.c-body { flex:1; margin:14px 18px; font-size:22px; line-height:1.45; white-space:pre-wrap; }
.chips { display:flex; flex-wrap:wrap; gap:8px; margin:0 18px 8px; }
.chip { display:none; align-items:center; gap:10px; background:#F1F3F4; border-radius:8px; padding:8px 14px; font-size:18px; font-weight:600; }
.c-foot { height:66px; display:flex; align-items:center; gap:10px; padding:0 18px; }
.send { display:flex; height:44px; border-radius:22px; overflow:hidden; background:#0B57D0; color:#fff; font-size:20px; font-weight:600; }
.send span { display:flex; align-items:center; padding:0 22px; }
.send span + span { padding:0 12px; border-left:1px solid rgba(255,255,255,0.35); }
.ficon { width:40px; height:40px; display:flex; align-items:center; justify-content:center; border-radius:8px; }
#send-menu { position:absolute; left:18px; bottom:72px; background:#fff; border-radius:8px; box-shadow:0 6px 22px rgba(0,0,0,0.24);
  padding:12px 20px; font-size:18px; display:none; align-items:center; gap:12px; }
#toast { position:absolute; left:24px; bottom:24px; z-index:5; background:#323232; color:#fff; border-radius:8px; padding:16px 22px;
  font-size:21px; display:none; gap:26px; }
#toast b { color:#A8C7FA; font-weight:600; }`;
}

function appHtml(render: UiRender, title: string): string {
  if (render.app === 'spreadsheet') {
    const cols = Array.from({ length: render.cols }, (_, i) => String.fromCharCode(65 + i));
    let grid = `<div class="hd"></div>${cols.map((c) => `<div class="hd">${c}</div>`).join('')}`;
    for (let r = 1; r <= render.rows; r++) {
      grid += `<div class="hd">${r}</div>`;
      for (const c of cols) {
        const v = render.cells[c + r];
        grid += `<div class="cell${v?.numeric ? ' num' : ''}" data-cell="${c}${r}"><span class="v">${escape(v?.text ?? '')}</span></div>`;
      }
    }
    const rb = (id: string, glyph: string, label: string, sm = false): string =>
      `<div class="rb${sm ? ' sm' : ''}" data-ui="${id}"><span class="g">${glyph}</span><span>${label}</span></div>`;
    return `<div class="titlebar"><span class="dots"><i></i><i></i><i></i></span>${escape(title)}</div>
<div class="tabs"><span class="tab">Archivo</span><span class="tab on" data-ui="tab_inicio">Inicio</span><span class="tab" data-ui="tab_insertar">Insertar</span>
<span class="tab">Disposición de página</span><span class="tab" data-ui="tab_formulas">Fórmulas</span><span class="tab" data-ui="tab_datos">Datos</span><span class="tab">Revisar</span><span class="tab">Vista</span></div>
<div class="ribbon">${rb('btn_pegar', '📋', 'Pegar', true)}<div class="sep"></div>${rb('btn_negrita', 'N', 'Negrita')}${rb('btn_cursiva', '<i>K</i>', 'Cursiva')}
${rb('btn_subrayado', '<u>S</u>', 'Subrayado')}<div class="sep"></div>${rb('btn_combinar', '⇔', 'Combinar y centrar', true)}<div class="sep"></div>
${rb('btn_contabilidad', '$', 'Contabilidad', true)}${rb('btn_porcentaje', '%', 'Porcentaje', true)}<div class="sep"></div>${rb('btn_autosuma', 'Σ', 'Autosuma')}</div>
<div class="fxbar"><div id="namebox">A1</div><div id="fx"><span class="fx">fx</span><span class="val"></span></div></div>
<div class="grid">${grid}</div>`;
  }
  if (render.app === 'document') {
    const paras = render.paragraphs.map((p, i) => `<p data-p="${i + 1}" data-style="${escape(p.style)}"${p.hidden ? ' style="display:none"' : ''}>` +
      `${p.segs.map((g) => `<span class="seg" data-seg="${g.id}">${escape(g.text)}</span>`).join('')}<span class="tail"></span></p>`).join('');
    const tb = (id: string, inner: string): string => `<div class="tb" data-ui="${id}">${inner}</div>`;
    return `<div class="titlebar"><div class="doc-icon"></div><span class="doc-name">${escape(title)}</span>
<div class="menus"><span data-ui="menu_archivo">Archivo</span><span>Editar</span><span>Ver</span><span data-ui="menu_insertar">Insertar</span>
<span data-ui="menu_formato">Formato</span><span>Herramientas</span><span>Extensiones</span><span>Ayuda</span></div></div>
<div class="toolbar">${tb('btn_deshacer', iconSvg('undo-2', 22, '#444'))}${tb('btn_rehacer', iconSvg('redo-2', 22, '#444'))}<span class="tsep"></span>
<div class="tb" id="style-btn" data-ui="btn_estilos"><span id="style-label">Texto normal</span>${iconSvg('chevron-down', 18, '#444')}</div><span class="tsep"></span>
${tb('btn_fuente', 'Arial')}<span class="tsep"></span>${tb('btn_negrita', iconSvg('bold', 22, '#444'))}${tb('btn_cursiva', iconSvg('italic', 22, '#444'))}
${tb('btn_subrayado', iconSvg('underline', 22, '#444'))}<span class="tsep"></span>${tb('btn_alinear', iconSvg('align-left', 22, '#444'))}
${tb('btn_centrar', iconSvg('align-center', 22, '#444'))}<span class="tsep"></span>${tb('btn_lista_numerada', iconSvg('list-ordered', 22, '#444'))}
${tb('btn_vinetas', iconSvg('list', 22, '#444'))}</div>
<div id="style-menu">${['Texto normal', 'Título', 'Subtítulo', 'Encabezado 1', 'Encabezado 2', 'Encabezado 3']
      .map((s) => `<div data-style-item="${escape(s)}">${escape(s)}</div>`).join('')}</div>
<div class="page-bg"><div class="page">${paras}</div></div>`;
  }
  const rows = render.inbox.map((m) => `<div class="row"><span class="from">${escape(m.from)}</span><span class="subj">${escape(m.subject)}</span>` +
    `<span class="snip">— ${escape(m.snippet)}</span></div>`).join('');
  const sentRow = render.sent
    ? `<div class="row"><span class="from">Para: ${escape(render.sent.to)}</span><span class="subj">${escape(render.sent.subject)}</span><span class="snip"></span></div>`
    : '';
  const pre = render.compose?.fields ?? {};
  const field = (k: string, label: string, extra = ''): string =>
    `<div class="c-field" data-field="${k}"${pre[k] && (k === 'cc' || k === 'cco') ? ' style="display:flex"' : ''}>` +
    `<span class="k">${label}</span><span class="val">${escape(pre[k] ?? '')}</span>${extra}</div>`;
  return `<div class="mail-top"><div class="mail-brand"><i></i>Correo</div><div class="search">${iconSvg('search', 22, '#5f6368')}Buscar en el correo</div></div>
<div class="mail-body">
<div class="side"><div id="compose-btn" data-ui="btn_redactar">${iconSvg('pencil', 24, '#001D35')}Redactar</div>
<div class="folder active" data-ui="carpeta_recibidos">${iconSvg('inbox', 22, '#202124')}Recibidos<span class="count">${render.inbox.length}</span></div>
<div class="folder">${iconSvg('star', 22, '#202124')}Destacados</div><div class="folder">${iconSvg('clock', 22, '#202124')}Pospuestos</div>
<div class="folder" data-ui="carpeta_enviados">${iconSvg('send', 22, '#202124')}Enviados</div><div class="folder">${iconSvg('file', 22, '#202124')}Borradores</div></div>
<div class="list"><div id="list-inbox">${rows}</div><div id="list-sent">${sentRow}</div></div>
</div>
<div id="compose"${render.compose ? ' style="display:flex"' : ''}><div class="c-head">Mensaje nuevo</div>
${field('para', 'Para', '<span class="cc-link" data-ui="btn_cc_cco">Cc Cco</span>')}${field('cc', 'Cc')}${field('cco', 'Cco')}${field('asunto', 'Asunto')}
<div class="c-body" data-field="cuerpo"><span class="val">${escape(pre.cuerpo ?? '')}</span></div>
<div class="chips">${render.chips.map((c, i) => `<div class="chip" data-chip="${i}"${i < (render.compose?.attached ?? 0) ? ' style="display:flex"' : ''}>${iconSvg('paperclip', 18, '#444')}${escape(c)}</div>`).join('')}</div>
<div class="c-foot"><div class="send"><span data-ui="btn_enviar">Enviar</span><span data-ui="btn_enviar_menu">${iconSvg('chevron-down', 18, '#fff')}</span></div>
<span class="ficon">${iconSvg('type', 22, '#444')}</span><span class="ficon" data-ui="btn_adjuntar">${iconSvg('paperclip', 22, '#444')}</span>
<span class="ficon">${iconSvg('link', 22, '#444')}</span><span class="ficon">${iconSvg('smile', 22, '#444')}</span><span class="ficon">${iconSvg('image', 22, '#444')}</span></div>
<div id="send-menu">${iconSvg('calendar-clock', 20, '#444')}Programar envío</div></div>
<div id="toast">Mensaje enviado. <b>Deshacer</b> <b>Ver mensaje</b></div>`;
}

/** Estado final sin animación (dry-run o sin tiempos de voz): todos los pasos aplicados. */
function staticState(demo: ResolvedUiDemo, times: number[]): string {
  return softwareRuntime(demo, times, (times[times.length - 1] ?? 0) + 10, true);
}

function softwareRuntime(demo: ResolvedUiDemo, times: number[], duration: number, finalOnly = false): string {
  const plan = demo.steps.map((s, i) => {
    const t = times[i] ?? 0.8 + i * 2.5;
    const next = times[i + 1] ?? duration;
    const typed = s.effects.reduce((n, e) => n + (e.k === 'type' ? e.text.length : 0), 0);
    const room = Math.max(0.6, next - t - 0.9);
    const cps = typed ? Math.max(TYPE_CPS, typed / room) : TYPE_CPS;
    const end = typed ? t + TYPE_DELAY + typed / cps : t + AFTER_DELAY;
    return { t, cps, end, cursor: s.cursor, effects: s.effects };
  });
  return `<script>
(function () {
  var plan = ${JSON.stringify(plan)};
  var app = document.getElementById('app');
  var initial = app.innerHTML;
  var cursor = document.getElementById('cursor');
  var ripple = document.getElementById('ripple');
  var items = document.querySelectorAll('.steps li');
  var header = document.querySelector('.header');
  function all(sel) { try { return app.querySelectorAll(sel); } catch (e) { return []; } }
  function apply(e, t, step) {
    var els = all(e.sel);
    if (e.k === 'type') {
      var n = Math.max(0, Math.min(e.text.length, Math.floor((t - step.t - ${TYPE_DELAY}) * step.cps)));
      var txt = e.text.slice(0, n);
      var typing = t < step.end;
      els.forEach(function (el) { el.textContent = txt; el.classList.toggle('typing', typing); });
      if (e.mirror) all(e.mirror).forEach(function (el) { el.textContent = txt; });
      return;
    }
    if (e.k === 'press') { if (t < step.t + 0.45) els.forEach(function (el) { el.classList.add('pressed'); }); return; }
    els.forEach(function (el) {
      if (e.k === 'show') { el.style.display = el.id === 'compose' ? 'flex' : (el.classList.contains('chip') || el.id === 'toast' || el.id === 'send-menu') ? 'flex' : 'block'; }
      else if (e.k === 'hide') el.style.display = 'none';
      else if (e.k === 'cls') el.classList.add(e.cls);
      else if (e.k === 'uncls') el.classList.remove(e.cls);
      else if (e.k === 'attr') el.setAttribute(e.name, e.value);
      else if (e.k === 'text') el.textContent = e.text;
    });
  }
  function center(sel) {
    var el = sel ? all(sel)[0] : null;
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2 };
  }
  function ease(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function seek(t) {
    if (header) { var h = Math.min(1, t / 0.5); header.style.opacity = h; header.style.transform = 'translateY(' + (-16 * (1 - h)) + 'px)'; }
    app.innerHTML = initial;
    var current = -1;
    for (var i = 0; i < plan.length; i++) {
      var step = plan[i];
      if (t < step.t) break;
      current = i;
      step.effects.forEach(function (e) { if (!e.after || t >= step.end) apply(e, t, step); });
    }
    items.forEach(function (li, k) {
      li.classList.toggle('done', k < current);
      li.classList.toggle('now', k === current);
    });
    // Cursor: viaja al elemento del paso siguiente durante los ${CURSOR_MOVE} s previos
    var next = plan[current + 1];
    var from = current >= 0 ? center(plan[current].cursor) : null;
    var to = next ? center(next.cursor) : null;
    var rect = app.getBoundingClientRect();
    var rest = { x: rect.left + rect.width * 0.62, y: rect.top + rect.height * 0.55 };
    from = from || rest;
    var pos = from;
    if (next && to && t > next.t - ${CURSOR_MOVE}) pos = { x: from.x + (to.x - from.x) * ease((t - next.t + ${CURSOR_MOVE}) / ${CURSOR_MOVE}), y: from.y + (to.y - from.y) * ease((t - next.t + ${CURSOR_MOVE}) / ${CURSOR_MOVE}) };
    var first = plan[0] ? plan[0].t : 0;
    cursor.style.opacity = Math.max(0, Math.min(1, (t - (first - 1.4)) / 0.4));
    cursor.style.transform = 'translate(' + (pos.x - 8) + 'px,' + (pos.y - 6) + 'px)';
    var since = current >= 0 ? t - plan[current].t : 99;
    if (since < 0.45 && from) {
      ripple.style.opacity = 1 - since / 0.45;
      ripple.style.left = from.x + 'px'; ripple.style.top = from.y + 'px';
      ripple.style.transform = 'scale(' + (0.4 + since * 2) + ')';
    } else ripple.style.opacity = 0;
  }
  var windows = [[0, 0.6]];
  plan.forEach(function (s) { windows.push([s.t - ${CURSOR_MOVE} - 0.05, Math.max(s.end, s.t + 0.5) + 0.05]); });
  window.__anim = { seek: seek, motionWindows: function () { return windows; } };
  seek(${finalOnly ? 'Infinity' : '0'});
})();
</script>`;
}
