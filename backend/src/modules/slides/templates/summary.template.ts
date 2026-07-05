import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, footerHtml, radiusValue, bulletFontSize, lerpColor, adaptiveTitleSize, baseSlideCSS } from './shared';

export function buildSummaryTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand, imageBase64, requiresAiImage } = data;
  const bullets = (scene.on_screen_text ?? []).slice(0, 5);
  const hasImage = requiresAiImage && !!imageBase64;
  const radius = radiusValue(theme);
  const fontSize = bulletFontSize(bullets, 34, 20);
  const count = bullets.length;
  const cardGap = count >= 5 ? 14 : count === 4 ? 18 : 22;
  const cardPad = count >= 5 ? '15px 28px' : count <= 2 ? '26px 32px' : '18px 28px';
  const iconSize = count >= 5 ? 34 : 40;

  const titleSize = adaptiveTitleSize(scene.title ?? 'En resumen', 48, 30);

  // Check icon SVG (white)
  const checkSvg = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3.5 9.5L7.5 13L14.5 5.5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const bulletCards = bullets.map((b, i) => {
    const t = count === 1 ? 0.4 : i / Math.max(count - 1, 1);
    const color = lerpColor(brand.primaryColor, brand.secondaryColor, t);
    return `
      <div style="
        background:white;
        border-left:5px solid ${color};
        border-radius:0 ${radius} ${radius} 0;
        box-shadow:0 2px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04);
        padding:${cardPad};
        margin-bottom:${i < count - 1 ? cardGap : 0}px;
        display:flex; align-items:center; gap:18px;
      ">
        <!-- Check badge -->
        <div style="
          width:${iconSize}px; height:${iconSize}px; min-width:${iconSize}px;
          border-radius:50%;
          background:${color};
          display:flex; align-items:center; justify-content:center;
          flex-shrink:0;
          box-shadow:0 2px 8px ${color}50;
        ">${checkSvg}</div>
        <!-- Text -->
        <span style="
          font-family:'Inter',sans-serif;
          font-size:${fontSize}px;
          font-weight:500;
          color:#1A1A1A;
          line-height:1.45;
        ">${escape(b)}</span>
      </div>
    `;
  }).join('');

  // Decorative right panel (when no image)
  const decoPanel = `
    <div style="
      position:relative;
      width:340px; min-width:340px;
      display:flex; align-items:center; justify-content:center;
      flex-shrink:0;
    ">
      <!-- Large background circle -->
      <div style="
        position:absolute;
        width:340px; height:340px; border-radius:50%;
        border:4px solid ${brand.primaryColor}18;
      "></div>
      <!-- Mid circle -->
      <div style="
        position:absolute;
        width:230px; height:230px; border-radius:50%;
        border:4px solid ${brand.secondaryColor}28;
        background:${brand.secondaryColor}06;
      "></div>
      <!-- Inner circle -->
      <div style="
        position:absolute;
        width:130px; height:130px; border-radius:50%;
        background:linear-gradient(135deg,${brand.primaryColor}18,${brand.secondaryColor}28);
        border:3px solid ${brand.secondaryColor}40;
        display:flex; align-items:center; justify-content:center;
      ">
        <!-- Checkmark in center -->
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
          <path d="M12 26L22 36L40 16" stroke="${brand.primaryColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
        </svg>
      </div>
    </div>
  `;

  // Premium header bar using brand primary color
  const summaryHeader = `
    <div style="
      height:110px;
      background:${brand.primaryColor};
      display:flex; align-items:center;
      padding:0 80px; gap:20px;
      position:relative; z-index:1;
      box-shadow:0 4px 24px ${brand.primaryColor}40;
      overflow:hidden;
    ">
      <!-- Decorative circle -->
      <div style="
        position:absolute; right:-40px; top:-40px;
        width:180px; height:180px; border-radius:50%;
        background:rgba(255,255,255,0.08);
        pointer-events:none;
      "></div>
      <div style="
        position:absolute; right:120px; bottom:-60px;
        width:150px; height:150px; border-radius:50%;
        background:rgba(255,255,255,0.06);
        pointer-events:none;
      "></div>
      <!-- "EN RESUMEN" badge -->
      <div style="
        background:rgba(255,255,255,0.22);
        border:1.5px solid rgba(255,255,255,0.40);
        color:#fff;
        font-family:'Inter',sans-serif;
        font-size:17px; font-weight:700;
        padding:8px 22px; border-radius:30px;
        letter-spacing:2px; white-space:nowrap;
        flex-shrink:0;
      ">EN RESUMEN</div>
      <div style="
        font-family:'Nunito',sans-serif;
        font-size:${titleSize}px; font-weight:900;
        color:#fff; flex:1; line-height:1.2;
        position:relative; z-index:1;
      ">${escape(scene.title ?? 'En resumen')}</div>
    </div>
  `;

  // No-image path: by design (requiresAiImage=false) OR fallback (image didn't arrive)
  if (!requiresAiImage || !imageBase64) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  ${baseSlideCSS(theme)}
  .body-row { flex:1; display:flex; position:relative; z-index:1; align-items:center; }
  .left-col { flex:1; padding:44px 52px 44px 80px; display:flex; flex-direction:column; justify-content:center; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${summaryHeader}
<div class="body-row">
  <div class="left-col">${bulletCards}</div>
  ${decoPanel}
</div>
${footerHtml(brand.logoBase64, brand.institutionName)}
</body>
</html>`;
  }

  // Split layout — only reached when imageBase64 is actually available
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  ${baseSlideCSS(theme)}
  .body-row { flex:1; display:flex; position:relative; z-index:1; align-items:stretch; }
  .left-col { width:54%; padding:40px 44px 40px 80px; display:flex; flex-direction:column; justify-content:center; }
  .divider { width:3px; background:linear-gradient(to bottom,${brand.secondaryColor}00,${brand.secondaryColor}55,${brand.secondaryColor}00); margin:40px 0; border-radius:3px; flex-shrink:0; }
  .right-col { width:46%; display:flex; align-items:center; justify-content:center; padding:40px; }
  .scene-image { max-width:100%; max-height:780px; object-fit:contain; border-radius:${radius}; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${summaryHeader}
<div class="body-row">
  <div class="left-col">${bulletCards}</div>
  <div class="divider"></div>
  <div class="right-col">
    <img class="scene-image" src="data:image/png;base64,${imageBase64}" alt="scene">
  </div>
</div>
${footerHtml(brand.logoBase64, brand.institutionName)}
</body>
</html>`;
}
