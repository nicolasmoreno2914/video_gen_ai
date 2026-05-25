import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, footerHtml, headerHtml, bulletFontSize, radiusValue, lerpColor } from './shared';

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

  // Split items evenly: left = first half, right = second half
  const half = Math.ceil(texts.length / 2);
  const leftItems  = texts.slice(0, half);
  const rightItems = texts.slice(half);

  const [leftTitle, rightTitle] = extractColumnTitles(scene.title ?? '');
  const allTexts = [...leftItems, ...rightItems];
  const fontSize = bulletFontSize(allTexts, 30, 20);
  const itemGap = allTexts.length > 6 ? 14 : 20;
  const radius = radiusValue(theme);

  // Determine if title colors are dark enough for white text (simple luminance check)
  function needsWhiteText(hex: string): boolean {
    const c = hex.replace('#', '');
    if (c.length !== 6) return true;
    const r = parseInt(c.slice(0, 2), 16) / 255;
    const g = parseInt(c.slice(2, 4), 16) / 255;
    const b = parseInt(c.slice(4, 6), 16) / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum < 0.55;
  }
  const leftTextColor  = needsWhiteText(brand.primaryColor)  ? '#ffffff' : '#1A1A1A';
  const rightTextColor = needsWhiteText(brand.secondaryColor) ? '#ffffff' : '#1A1A1A';

  const colTitleSize = Math.max(26, Math.min(38, 44 - Math.max(leftTitle.length, rightTitle.length) / 2.2));

  const checkIcon = (color: string) =>
    `<div style="width:30px;height:30px;min-width:30px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:3px">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8L6.5 11.5L13 5" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>`;

  const colItems = (items: string[], color: string) =>
    items.map(b =>
      `<div style="
        background:white;
        border-left:5px solid ${color};
        border-radius:0 ${radius} ${radius} 0;
        box-shadow:0 2px 14px rgba(0,0,0,0.08);
        padding:18px 24px 18px 20px;
        margin-bottom:${itemGap}px;
        display:flex;
        align-items:flex-start;
        gap:16px;
      ">
        ${checkIcon(color)}
        <span style="font-family:'Inter',sans-serif;font-size:${fontSize}px;font-weight:500;color:#1A1A1A;line-height:1.45">${escape(b)}</span>
      </div>`
    ).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:#f5f7fa; font-family:'Nunito',sans-serif; display:flex; flex-direction:column; }
  .grid-bg { position:fixed; inset:0; ${bgStyle(theme)} opacity:0.45; z-index:0; }
  .body { flex:1; display:flex; position:relative; z-index:1; gap:0; }

  /* Left column */
  .col-left {
    flex:1; display:flex; flex-direction:column; overflow:hidden;
    background:${brand.primaryColor}0d;
    border-right:1px solid ${brand.primaryColor}25;
  }
  .col-header-left {
    background:${brand.primaryColor};
    padding:28px 48px;
    display:flex; align-items:center; gap:18px;
    box-shadow:0 4px 20px ${brand.primaryColor}40;
  }

  /* Right column */
  .col-right {
    flex:1; display:flex; flex-direction:column; overflow:hidden;
    background:${brand.secondaryColor}0d;
  }
  .col-header-right {
    background:${brand.secondaryColor};
    padding:28px 48px;
    display:flex; align-items:center; gap:18px;
    box-shadow:0 4px 20px ${brand.secondaryColor}40;
  }

  .col-letter {
    width:52px; height:52px; min-width:52px; border-radius:50%;
    background:rgba(255,255,255,0.22); border:2px solid rgba(255,255,255,0.5);
    display:flex; align-items:center; justify-content:center;
    color:#fff; font-weight:900; font-size:24px;
  }
  .col-title { font-size:${colTitleSize}px; font-weight:900; line-height:1.2; }
  .items { flex:1; padding:32px 48px; display:flex; flex-direction:column; justify-content:center; }

  /* VS divider */
  .vs-divider {
    width:88px; min-width:88px; display:flex; flex-direction:column;
    align-items:center; justify-content:center; position:relative; z-index:2;
    background:transparent;
  }
  .vs-line {
    position:absolute; top:0; bottom:0; width:2px;
    background:linear-gradient(to bottom, transparent, ${brand.primaryColor}50, ${brand.secondaryColor}50, transparent);
  }
  .vs-badge {
    width:76px; height:76px; border-radius:50%;
    background:linear-gradient(135deg,${brand.primaryColor},${brand.secondaryColor});
    color:#fff; font-family:'Nunito',sans-serif; font-size:28px; font-weight:900;
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 6px 28px rgba(0,0,0,0.22);
    z-index:1; position:relative;
    border:4px solid white;
  }

  .footer { height:88px; border-top:1px solid #e5e8ec; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; background:white; }
  .watermark { display:flex; align-items:center; gap:10px; opacity:0.45; }
  .watermark img { max-height:36px; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:16px; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${headerHtml(theme, brand.primaryColor, brand.secondaryColor, scene.title ?? '', 'COMPARACIÓN')}
<div class="body">
  <!-- Left column -->
  <div class="col-left">
    <div class="col-header-left">
      <div class="col-letter">A</div>
      <div class="col-title" style="color:${leftTextColor}">${escape(leftTitle)}</div>
    </div>
    <div class="items">${colItems(leftItems, brand.primaryColor)}</div>
  </div>

  <!-- VS center divider -->
  <div class="vs-divider">
    <div class="vs-line"></div>
    <div class="vs-badge">vs</div>
  </div>

  <!-- Right column -->
  <div class="col-right">
    <div class="col-header-right">
      <div class="col-letter">B</div>
      <div class="col-title" style="color:${rightTextColor}">${escape(rightTitle)}</div>
    </div>
    <div class="items">${colItems(rightItems, brand.secondaryColor)}</div>
  </div>
</div>
${footerHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
}
