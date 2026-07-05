import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, footerHtml, headerHtml, bulletFontSize, radiusValue, lerpColor, baseSlideCSS } from './shared';

export function buildExampleCardTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand, imageBase64, requiresAiImage } = data;
  const bullets = (scene.on_screen_text ?? []).slice(0, 3);
  const hasImage = requiresAiImage && !!imageBase64;
  const radius = radiusValue(theme);
  const fontSize = bulletFontSize(bullets, 32, 20);
  const count = bullets.length;
  const cardGap = count >= 3 ? 18 : 26;
  const cardPad = count >= 3 ? '18px 28px' : '24px 32px';
  const iconSize = count >= 3 ? 38 : 46;

  // Card-style bullet items
  const bulletCards = bullets.map((b, i) => {
    const t = count === 1 ? 0.4 : i / Math.max(count - 1, 1);
    const color = lerpColor(brand.primaryColor, brand.secondaryColor, t);
    return `
      <div style="
        background:rgba(255,255,255,0.92);
        border-left:5px solid ${color};
        border-radius:0 ${radius} ${radius} 0;
        box-shadow:0 2px 16px rgba(0,0,0,0.09);
        padding:${cardPad};
        margin-bottom:${i < count - 1 ? cardGap : 0}px;
        display:flex; align-items:center; gap:18px;
        backdrop-filter:blur(2px);
      ">
        <!-- Number badge -->
        <div style="
          width:${iconSize}px; height:${iconSize}px; min-width:${iconSize}px;
          border-radius:50%;
          background:${color}22; border:2px solid ${color}55;
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
        ">
          <span style="
            color:${color}; font-family:'Nunito',sans-serif;
            font-size:${Math.round(iconSize * 0.42)}px; font-weight:900;
          ">${i + 1}</span>
        </div>
        <span style="
          font-family:'Inter',sans-serif;
          font-size:${fontSize}px; font-weight:500;
          color:#1A1A1A; line-height:1.45;
        ">${escape(b)}</span>
      </div>
    `;
  }).join('');

  // Left visual panel
  const leftPanel = hasImage
    ? `<div style="width:54%;position:relative;overflow:hidden;flex-shrink:0">
        <img style="width:100%;height:100%;object-fit:cover" src="data:image/png;base64,${imageBase64}" alt="scene">
        <!-- Gradient fade to white on right edge -->
        <div style="position:absolute;inset:0;background:linear-gradient(to right,transparent 55%,white 100%)"></div>
      </div>`
    : `<div style="
        width:50%; flex-shrink:0;
        background:linear-gradient(145deg, ${brand.primaryColor}, ${brand.secondaryColor});
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        gap:32px; position:relative; overflow:hidden;
      ">
        <!-- Decorative circles -->
        <div style="
          position:absolute; width:500px; height:500px; border-radius:50%;
          border:2px solid rgba(255,255,255,0.12);
          top:-120px; right:-160px; pointer-events:none;
        "></div>
        <div style="
          position:absolute; width:280px; height:280px; border-radius:50%;
          border:2px solid rgba(255,255,255,0.09);
          bottom:-80px; left:-60px; pointer-events:none;
        "></div>
        <!-- Central icon -->
        <div style="
          width:160px; height:160px; border-radius:50%;
          background:rgba(255,255,255,0.18);
          border:3px solid rgba(255,255,255,0.35);
          display:flex; align-items:center; justify-content:center;
          box-shadow:0 8px 32px rgba(0,0,0,0.15);
          position:relative; z-index:1;
        ">
          <!-- Lightbulb / idea SVG -->
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none"
               stroke="rgba(255,255,255,0.90)" stroke-width="1.4"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18h6M10 22h4"/>
            <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17H8v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
          </svg>
        </div>
        <div style="
          font-family:'Nunito',sans-serif; font-size:26px; font-weight:800;
          color:rgba(255,255,255,0.88); letter-spacing:2px;
          text-transform:uppercase; position:relative; z-index:1;
        ">CASO PRÁCTICO</div>
        <!-- Gradient fade to white on right edge -->
        <div style="
          position:absolute; top:0; right:0; bottom:0; width:80px;
          background:linear-gradient(to right,transparent,white);
          pointer-events:none;
        "></div>
      </div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  ${baseSlideCSS(theme)}
  .body { flex:1; display:flex; position:relative; z-index:1; align-items:stretch; overflow:hidden; }
  .text-panel {
    flex:1; display:flex; flex-direction:column; justify-content:center;
    padding:44px 72px 44px 52px; gap:24px;
  }
  .case-badge {
    background:${brand.secondaryColor}; color:#fff;
    font-family:'Inter',sans-serif; font-size:18px; font-weight:700;
    padding:9px 26px; border-radius:30px; width:fit-content;
    letter-spacing:1px;
    box-shadow:0 3px 12px ${brand.secondaryColor}50;
  }
</style>
</head>
<body>
<div class="grid-bg"></div>
${headerHtml(theme, brand.primaryColor, brand.secondaryColor, scene.title ?? '', 'EJEMPLO PRÁCTICO')}
<div class="body">
  ${leftPanel}
  <div class="text-panel">
    <div class="case-badge">CASO REAL</div>
    ${bulletCards}
  </div>
</div>
${footerHtml(brand.logoBase64, brand.institutionName)}
</body>
</html>`;
}
