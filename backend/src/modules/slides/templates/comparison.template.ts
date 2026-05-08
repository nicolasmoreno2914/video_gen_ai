import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, footerHtml, headerHtml, bulletFontSize } from './shared';

function extractColumnTitles(title: string): [string, string] {
  // "A vs B" / "A versus B"
  const vs = title.match(/^(.+?)\s+(?:vs\.?|versus)\s+(.+)$/i);
  if (vs) return [vs[1].trim(), vs[2].trim()];

  // "entre A y B"
  const entre = title.match(/entre\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+y\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)(?:\s*[:·\-].*)?$/i);
  if (entre && entre[1].length < 45 && entre[2].length < 45) return [entre[1].trim(), entre[2].trim()];

  // "A y B:" — short named concepts
  const yColon = title.match(/^(.+?)\s+y\s+(.+?)(?:\s*[:·\-])/i);
  if (yColon && yColon[1].length < 35 && yColon[2].length < 35) return [yColon[1].trim(), yColon[2].trim()];

  return ['Concepto A', 'Concepto B'];
}

export function buildComparisonTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand } = data;
  const texts = scene.on_screen_text ?? [];

  // Split items as evenly as possible: left = first half, right = second half
  const half = Math.floor(texts.length / 2);
  const leftItems  = texts.slice(0, Math.max(half, Math.ceil(texts.length / 2)));
  const rightItems = texts.slice(leftItems.length);

  const [leftTitle, rightTitle] = extractColumnTitles(scene.title ?? '');

  const allTexts = [...leftItems, ...rightItems];
  const fontSize = bulletFontSize(allTexts, 34, 22);
  const itemGap = allTexts.length > 6 ? 16 : 24;

  const colItems = (items: string[], dotColor: string) =>
    items.map(b =>
      `<div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:${itemGap}px">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${dotColor};flex-shrink:0;margin-top:${Math.round(fontSize * 0.35)}px"></span>
        <span style="font-family:'Inter',sans-serif;font-size:${fontSize}px;color:#1A1A1A;line-height:1.45">${escape(b)}</span>
      </div>`
    ).join('');

  const colTitleSize = Math.max(28, Math.min(38, 42 - Math.max(leftTitle.length, rightTitle.length) / 2));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:#fff; font-family:'Nunito',sans-serif; display:flex; flex-direction:column; }
  .grid-bg { position:fixed; inset:0; ${bgStyle(theme)} opacity:0.55; z-index:0; }
  .header { height:110px; display:flex; align-items:center; padding:0 70px; gap:20px; position:relative; z-index:1; }
  .scene-title { font-weight:700; flex:1; }
  .body { flex:1; display:flex; position:relative; z-index:1; }
  .col { flex:1; display:flex; flex-direction:column; padding:44px 64px; }
  .col-left { background:${brand.primaryColor}07; border-right:3px solid ${brand.primaryColor}20; }
  .col-right { background:${brand.secondaryColor}07; }
  .col-header { display:flex; align-items:center; gap:14px; padding-bottom:24px; margin-bottom:20px; border-bottom:3px solid; }
  .col-num { width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:900; font-size:20px; flex-shrink:0; }
  .col-title { font-size:${colTitleSize}px; font-weight:900; line-height:1.2; }
  .items { flex:1; display:flex; flex-direction:column; justify-content:center; }
  .vs-divider { width:72px; display:flex; align-items:center; justify-content:center; flex-shrink:0; position:relative; z-index:2; }
  .vs-badge { width:64px; height:64px; border-radius:50%; background:${brand.secondaryColor}; color:#fff; font-family:'Inter',sans-serif; font-size:22px; font-weight:900; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 16px rgba(0,0,0,0.15); }
  .footer { height:100px; border-top:2px solid #f0f0f0; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; }
  .watermark { display:flex; align-items:center; gap:10px; opacity:0.45; }
  .watermark img { max-height:36px; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:16px; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${headerHtml(theme, brand.primaryColor, brand.secondaryColor, scene.title ?? '', 'COMPARACIÓN')}
<div class="body">
  <div class="col col-left">
    <div class="col-header" style="border-color:${brand.primaryColor}">
      <div class="col-num" style="background:${brand.primaryColor}">A</div>
      <div class="col-title" style="color:${brand.primaryColor}">${escape(leftTitle)}</div>
    </div>
    <div class="items">${colItems(leftItems, brand.primaryColor)}</div>
  </div>
  <div class="vs-divider"><div class="vs-badge">vs</div></div>
  <div class="col col-right">
    <div class="col-header" style="border-color:${brand.secondaryColor}">
      <div class="col-num" style="background:${brand.secondaryColor}">B</div>
      <div class="col-title" style="color:${brand.secondaryColor}">${escape(rightTitle)}</div>
    </div>
    <div class="items">${colItems(rightItems, brand.secondaryColor)}</div>
  </div>
</div>
${footerHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
}
