import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, radiusValue, bulletFontSize, lerpColor } from './shared';

export function buildConclusionTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand, imageBase64 } = data;
  const bullets = (scene.on_screen_text ?? []).slice(0, 4);
  const bgImage = imageBase64 ? `url('data:image/png;base64,${imageBase64}')` : 'none';
  const radius = radiusValue(theme);
  const fontSize = bulletFontSize(bullets, 32, 20);
  const count = bullets.length;
  const gap = count >= 4 ? 15 : 22;
  const cardPad = count >= 4 ? '16px 28px' : '20px 32px';
  const iconSize = count >= 4 ? 34 : 40;

  const titleSize = Math.max(42, Math.min(62, 72 - Math.floor((scene.title ?? '').length / 3.5)));

  // Card-style bullets inside the white card
  const checkSvg = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 5" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const bulletCards = bullets.map((b, i) => {
    const t = count === 1 ? 0.4 : i / Math.max(count - 1, 1);
    const color = lerpColor(brand.primaryColor, brand.secondaryColor, t);
    return `
      <div style="
        background:#f8f9fa;
        border-left:5px solid ${color};
        border-radius:0 12px 12px 0;
        padding:${cardPad};
        margin-bottom:${i < count - 1 ? gap : 0}px;
        display:flex; align-items:center; gap:18px;
        box-shadow:0 1px 6px rgba(0,0,0,0.06);
      ">
        <!-- Check icon badge -->
        <div style="
          width:${iconSize}px; height:${iconSize}px; min-width:${iconSize}px;
          border-radius:50%; background:${color};
          display:flex; align-items:center; justify-content:center;
          flex-shrink:0; box-shadow:0 2px 8px ${color}55;
        ">${checkSvg}</div>
        <span style="
          font-family:'Inter',sans-serif;
          font-size:${fontSize}px; font-weight:500;
          color:#2A2A2A; line-height:1.45;
        ">${escape(b)}</span>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1920px; height:1080px; overflow:hidden;
    background:${brand.primaryColor};
    font-family:'Nunito',sans-serif;
    display:flex; align-items:center; justify-content:center;
    position:relative;
  }

  /* Background image texture */
  .doodle-bg {
    position:absolute; inset:0;
    background-image:${bgImage};
    background-size:cover; background-position:center;
    opacity:0.05; pointer-events:none;
  }

  /* Large decorative circles */
  .deco-lg {
    position:absolute; width:780px; height:780px; border-radius:50%;
    border:2px solid rgba(255,255,255,0.08);
    top:-200px; right:-180px; pointer-events:none;
  }
  .deco-md {
    position:absolute; width:460px; height:460px; border-radius:50%;
    border:2px solid rgba(255,255,255,0.06);
    bottom:-100px; left:-80px; pointer-events:none;
  }
  .deco-sm {
    position:absolute; width:200px; height:200px; border-radius:50%;
    background:rgba(255,255,255,0.05);
    top:80px; left:120px; pointer-events:none;
  }

  /* Main white card */
  .card {
    position:relative; z-index:1;
    background:#fff;
    border-radius:${radius};
    padding:64px 80px;
    max-width:1420px; width:88%;
    display:flex; flex-direction:column; gap:28px;
    box-shadow:0 24px 72px rgba(0,0,0,0.30);
  }

  /* Top row: badge + title */
  .card-top { display:flex; flex-direction:column; gap:20px; }

  .reflex-badge {
    background:${brand.secondaryColor};
    color:#fff; font-family:'Inter',sans-serif;
    font-size:18px; font-weight:700;
    letter-spacing:2px; padding:9px 28px;
    border-radius:30px; width:fit-content;
    box-shadow:0 3px 12px ${brand.secondaryColor}55;
  }
  .card-title { font-weight:900; color:#1A1A1A; line-height:1.08; }

  /* Divider between title and bullets */
  .card-divider {
    height:3px;
    background:linear-gradient(to right, ${brand.primaryColor}, ${brand.secondaryColor}, transparent);
    border-radius:2px; margin:4px 0;
  }

  /* Watermark */
  .watermark {
    position:absolute; bottom:24px; right:32px;
    display:flex; align-items:center; gap:10px;
    opacity:0.30; z-index:2;
  }
  .watermark img { max-height:32px; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:15px; color:#fff; }
</style>
</head>
<body>
${imageBase64 ? '<div class="doodle-bg"></div>' : ''}
<div class="deco-lg"></div>
<div class="deco-md"></div>
<div class="deco-sm"></div>

<div class="card">
  <div class="card-top">
    <div class="reflex-badge">CONCLUSIÓN</div>
    <div class="card-title" style="font-size:${titleSize}px">${escape(scene.title ?? '')}</div>
  </div>
  <div class="card-divider"></div>
  <div>${bulletCards}</div>
</div>

<div class="watermark">
  ${brand.logoUrl ? `<img src="${brand.logoUrl}" alt="logo">` : ''}
  <span class="watermark-name">${escape(brand.institutionName)}</span>
</div>
</body>
</html>`;
}
