import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, footerHtml, headerHtml, lerpColor } from './shared';

export function buildLevelsTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand } = data;
  const levels = (scene.on_screen_text ?? []).slice(0, 7);
  const count = levels.length;

  // Font size based on count
  const fontSize = count <= 4 ? 34 : count <= 6 ? 28 : 24;
  const barHeight = count <= 4 ? 96 : count <= 6 ? 80 : 68;
  const gap = count <= 4 ? 12 : 8;

  // Width: from 38% (narrowest, bottom) to 88% (widest, top)
  // The levels array index 0 = first item (conceptually "level 1 / most basic")
  // We display index 0 at BOTTOM after reversing → widest bar = most foundational
  const levelBoxes = levels.map((level, i) => {
    const pct = count === 1 ? 1 : i / (count - 1);
    // pct=0 → narrowest (top after reverse), pct=1 → widest (bottom after reverse)
    const widthPct = Math.round(38 + pct * 50); // 38% to 88%
    const color = lerpColor(brand.secondaryColor, brand.primaryColor, pct);
    const labelNum = count - i; // show number in reverse: top=1, bottom=N
    return `<div style="
      width:${widthPct}%;
      height:${barHeight}px;
      background:${color};
      border-radius:10px;
      display:flex;
      align-items:center;
      gap:20px;
      padding:0 28px;
      color:#fff;
      flex-shrink:0;
    ">
      <span style="font-family:'Nunito',sans-serif;font-size:${Math.round(fontSize * 0.85)}px;font-weight:900;opacity:0.75;min-width:28px;text-align:center">${labelNum}</span>
      <span style="font-family:'Inter',sans-serif;font-size:${fontSize}px;font-weight:600;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escape(level)}</span>
    </div>`;
  });

  // Reverse: highest index (widest) goes to bottom, so display top-to-bottom = narrow to wide
  const barsHtml = [...levelBoxes].reverse().join(`<div style="height:${gap}px"></div>`);

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
  .body { flex:1; display:flex; align-items:center; justify-content:center; position:relative; z-index:1; padding:28px 80px; }
  .pyramid { display:flex; flex-direction:column; align-items:center; width:100%; }
  .footer { height:100px; border-top:2px solid #f0f0f0; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; }
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
${footerHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
}
