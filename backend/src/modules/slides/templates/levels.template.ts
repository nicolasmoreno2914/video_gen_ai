import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, footerHtml, headerHtml, lerpColor } from './shared';

export function buildLevelsTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand } = data;
  const levels = (scene.on_screen_text ?? []).slice(0, 7);
  const count = levels.length;

  // Dynamic sizing
  const fontSize = count <= 3 ? 34 : count <= 5 ? 28 : 23;
  const barHeight = count <= 3 ? 106 : count <= 5 ? 88 : 72;
  const gap = count <= 4 ? 12 : 8;
  const borderR = 12;

  // Width: narrowest at top (level 1 = highest/most specific), widest at bottom (foundational)
  // index 0 in array = "level 1" shown at top = narrowest
  const levelBoxes = levels.map((level, i) => {
    const pct = count === 1 ? 1 : i / (count - 1);
    // i=0 → pct=0 → narrowest; i=last → pct=1 → widest
    const widthPct = Math.round(36 + pct * 54); // 36% to 90%
    const color = lerpColor(brand.secondaryColor, brand.primaryColor, pct);
    const labelNum = count - i; // visual label: top=highest number, bottom=1 (foundational)

    // Determine if text needs dark color (for lighter colors)
    function needsWhiteText(hex: string): boolean {
      const c = hex.replace('#', '');
      if (c.length !== 6) return true;
      const r = parseInt(c.slice(0, 2), 16) / 255;
      const g = parseInt(c.slice(2, 4), 16) / 255;
      const b = parseInt(c.slice(4, 6), 16) / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      return lum < 0.55;
    }
    const textColor = needsWhiteText(color) ? '#fff' : '#1a1a1a';
    const mutedColor = needsWhiteText(color) ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';

    return `<div style="
      width:${widthPct}%;
      height:${barHeight}px;
      background:${color};
      border-radius:${borderR}px;
      display:flex;
      align-items:center;
      gap:18px;
      padding:0 28px 0 24px;
      flex-shrink:0;
      box-shadow:0 4px 16px ${color}50;
      position:relative;
      overflow:hidden;
    ">
      <!-- Decorative shine -->
      <div style="
        position:absolute; top:0; left:0; right:0; height:50%;
        background:rgba(255,255,255,0.10);
        border-radius:${borderR}px ${borderR}px 0 0;
        pointer-events:none;
      "></div>
      <!-- Level number badge -->
      <div style="
        min-width:${barHeight * 0.55}px; height:${barHeight * 0.55}px;
        border-radius:50%;
        background:rgba(255,255,255,0.20);
        border:2px solid rgba(255,255,255,0.40);
        display:flex; align-items:center; justify-content:center;
        flex-shrink:0; position:relative; z-index:1;
      ">
        <span style="
          color:${textColor};
          font-family:'Nunito',sans-serif;
          font-size:${Math.round(fontSize * 0.78)}px;
          font-weight:900;
        ">${labelNum}</span>
      </div>
      <!-- Text -->
      <span style="
        font-family:'Inter',sans-serif;
        font-size:${fontSize}px;
        font-weight:600;
        color:${textColor};
        line-height:1.3;
        overflow:hidden;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
        position:relative; z-index:1;
      ">${escape(level)}</span>
      <!-- Right width indicator dots -->
      <div style="
        margin-left:auto;
        display:flex; gap:5px; align-items:center;
        position:relative; z-index:1; flex-shrink:0;
      ">
        ${[0,1,2].map(j =>
          `<div style="
            width:6px; height:6px; border-radius:50%;
            background:${j < Math.round(pct * 3) ? textColor : 'rgba(255,255,255,0.20)'};
            opacity:${j < Math.round(pct * 3) ? 0.7 : 0.3};
          "></div>`
        ).join('')}
      </div>
    </div>`;
  });

  // Reverse so narrowest (index 0) is at top
  const barsHtml = [...levelBoxes].reverse().join(`<div style="height:${gap}px"></div>`);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:#f5f7fa; font-family:'Nunito',sans-serif; display:flex; flex-direction:column; }
  .grid-bg { position:fixed; inset:0; ${bgStyle(theme)} opacity:0.45; z-index:0; }
  .body { flex:1; display:flex; align-items:center; justify-content:center; position:relative; z-index:1; padding:24px 80px; }
  .pyramid { display:flex; flex-direction:column; align-items:center; width:100%; }
  .footer { height:88px; border-top:1px solid #e5e8ec; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; background:white; }
  .watermark { display:flex; align-items:center; gap:10px; opacity:0.45; }
  .watermark img { max-height:36px; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:16px; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${headerHtml(theme, brand.primaryColor, brand.secondaryColor, scene.title ?? '', 'NIVELES')}
<div class="body">
  <div class="pyramid">${barsHtml}</div>
</div>
${footerHtml(brand.logoBase64, brand.institutionName)}
</body>
</html>`;
}
