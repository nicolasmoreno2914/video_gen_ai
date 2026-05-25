import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import {
  GOOGLE_FONTS, escape, highlighted, bgStyle, footerHtml, headerHtml,
  radiusValue, bulletFontSize, lerpColor, isKeyword,
} from './shared';

/**
 * Premium full-width content layout (no image).
 * – Left decorative strip with gradient + subtle label
 * – Right main area: bullet CARDS with shadow, left-color border, check/number icons
 * – 1-2 items: large featured cards
 * – 3-5 items: stacked cards with size adaption
 */
function buildNoImageLayout(
  bullets: string[],
  highlights: string[],
  primary: string,
  secondary: string,
  radius: string,
  badge: string | undefined,
): string {
  const count = bullets.length;
  const fontSize = bulletFontSize(bullets, 32, 18);
  const cardGap = count >= 5 ? 14 : count === 4 ? 18 : 22;
  const cardPad = count >= 5 ? '16px 28px' : count <= 2 ? '28px 36px' : '20px 32px';
  const iconSize = count >= 5 ? 34 : 42;
  const iconFontSize = count >= 5 ? 15 : 18;

  const cards = bullets.map((b, i) => {
    const t = count === 1 ? 0.4 : i / Math.max(count - 1, 1);
    const color = lerpColor(primary, secondary, t);
    const kw = isKeyword(b);

    return `
      <div style="
        background:white;
        border-left:6px solid ${color};
        border-radius:0 ${radius} ${radius} 0;
        box-shadow:0 2px 18px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.05);
        padding:${cardPad};
        margin-bottom:${i < count - 1 ? cardGap : 0}px;
        display:flex;
        align-items:center;
        gap:20px;
        transition:none;
      ">
        <!-- Number badge -->
        <div style="
          width:${iconSize}px; height:${iconSize}px; min-width:${iconSize}px;
          border-radius:50%;
          background:${color}18;
          border:2px solid ${color}55;
          display:flex; align-items:center; justify-content:center;
          flex-shrink:0;
        ">
          <span style="
            color:${color};
            font-family:'Nunito',sans-serif;
            font-size:${iconFontSize}px;
            font-weight:900;
          ">${i + 1}</span>
        </div>
        <!-- Text -->
        <span style="
          font-family:'Inter',sans-serif;
          font-size:${fontSize}px;
          font-weight:${kw ? '700' : '500'};
          color:#1A1A1A;
          line-height:1.5;
        ">${highlighted(b, highlights, secondary)}</span>
      </div>
    `;
  }).join('');

  // Decorative left strip label text
  const stripLabel = badge ?? 'CONTENIDO';

  return `
    <div style="display:flex;align-items:stretch;flex:1;overflow:hidden">
      <!-- Left decorative strip -->
      <div style="
        width:96px; min-width:96px; flex-shrink:0;
        background:linear-gradient(to bottom,${primary},${secondary});
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        gap:20px; padding:40px 12px;
        position:relative;
        overflow:hidden;
      ">
        <!-- Decorative circles -->
        <div style="
          position:absolute; top:-40px; left:-20px;
          width:100px; height:100px; border-radius:50%;
          background:rgba(255,255,255,0.10);
        "></div>
        <div style="
          position:absolute; bottom:-30px; right:-25px;
          width:80px; height:80px; border-radius:50%;
          background:rgba(255,255,255,0.10);
        "></div>
        <!-- Vertical label -->
        <div style="
          writing-mode:vertical-rl;
          text-orientation:mixed;
          color:rgba(255,255,255,0.75);
          font-family:'Inter',sans-serif;
          font-size:15px; font-weight:700;
          letter-spacing:4px;
          text-transform:uppercase;
          transform:rotate(180deg);
          position:relative; z-index:1;
        ">${escape(stripLabel)}</div>
        <!-- Divider dots -->
        <div style="display:flex;flex-direction:column;gap:8px;position:relative;z-index:1">
          ${[0,1,2].map(j =>
            `<div style="
              width:8px;height:8px;border-radius:50%;
              background:rgba(255,255,255,${0.7 - j * 0.15});
            "></div>`
          ).join('')}
        </div>
      </div>

      <!-- Cards area -->
      <div style="
        flex:1;
        padding:40px 80px 40px 56px;
        display:flex; flex-direction:column; justify-content:center;
      ">
        ${cards}
      </div>
    </div>
  `;
}

export function buildContentTemplate(data: SlideTemplateData, theme: VideoTheme, badge?: string): string {
  const { scene, brand, imageBase64, requiresAiImage } = data;
  const bullets = (scene.on_screen_text ?? []).slice(0, 5);
  const highlights = scene.highlight_words ?? [];
  const radius = radiusValue(theme);
  const imgLeft = theme.imagePosition === 'left';
  const hasImage = requiresAiImage && !!imageBase64;
  const fontSize = bulletFontSize(bullets);

  const baseCSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:#f5f7fa; font-family:'Nunito',sans-serif; display:flex; flex-direction:column; }
  .grid-bg { position:fixed; inset:0; ${bgStyle(theme)} opacity:0.45; z-index:0; }
  .footer { height:88px; border-top:1px solid #e5e8ec; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; background:white; }
  .watermark { display:flex; align-items:center; gap:10px; opacity:0.45; }
  .watermark img { max-height:36px; object-fit:contain; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:16px; }`;

  if (!requiresAiImage) {
    // ── Premium no-image layout ──────────────────────────────────────────────
    const bodyContent = buildNoImageLayout(
      bullets, highlights,
      brand.primaryColor, brand.secondaryColor,
      radius, badge,
    );

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  ${baseCSS}
  .body-row { flex:1; display:flex; position:relative; z-index:1; align-items:stretch; overflow:hidden; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${headerHtml(theme, brand.primaryColor, brand.secondaryColor, scene.title ?? '', badge)}
<div class="body-row">
  ${bodyContent}
</div>
${footerHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
  }

  // ── Split layout with image ────────────────────────────────────────────────
  // Build inline bullet HTML for the image layout (keep card style here too)
  const count = bullets.length;
  const cardGap = count >= 5 ? 14 : count === 4 ? 18 : 22;
  const cardPad = count >= 5 ? '14px 24px' : count <= 2 ? '24px 28px' : '18px 28px';
  const iconSize = count >= 5 ? 30 : 36;
  const iconFontSize = count >= 5 ? 13 : 16;

  const bulletCards = bullets.map((b, i) => {
    const t = count === 1 ? 0.4 : i / Math.max(count - 1, 1);
    const color = lerpColor(brand.primaryColor, brand.secondaryColor, t);
    const kw = isKeyword(b);
    return `
      <div style="
        background:white;
        border-left:5px solid ${color};
        border-radius:0 ${radius} ${radius} 0;
        box-shadow:0 2px 14px rgba(0,0,0,0.08);
        padding:${cardPad};
        margin-bottom:${i < count - 1 ? cardGap : 0}px;
        display:flex; align-items:center; gap:16px;
      ">
        <div style="
          width:${iconSize}px; height:${iconSize}px; min-width:${iconSize}px;
          border-radius:50%;
          background:${color}18; border:2px solid ${color}50;
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
        ">
          <span style="color:${color};font-family:'Nunito',sans-serif;font-size:${iconFontSize}px;font-weight:900">${i + 1}</span>
        </div>
        <span style="
          font-family:'Inter',sans-serif;
          font-size:${fontSize}px;
          font-weight:${kw ? '700' : '500'};
          color:#1A1A1A; line-height:1.45;
        ">${highlighted(b, highlights, brand.secondaryColor)}</span>
      </div>
    `;
  }).join('');

  const textCol = `<div class="text-col">${bulletCards}</div>`;
  const imgCol = `<div class="img-col">
    ${hasImage
      ? `<img class="scene-image" style="border-radius:${radius}" src="data:image/png;base64,${imageBase64}" alt="scene">`
      : `<div style="width:100%;height:560px;border-radius:${radius};background:linear-gradient(135deg,${brand.primaryColor}20,${brand.secondaryColor}20)"></div>`}
  </div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  ${baseCSS}
  .body-row { flex:1; display:flex; position:relative; z-index:1; flex-direction:${imgLeft ? 'row-reverse' : 'row'}; align-items:stretch; }
  .text-col { width:54%; padding:40px 48px 40px 64px; display:flex; flex-direction:column; justify-content:center; }
  .divider { width:3px; background:linear-gradient(to bottom,${brand.secondaryColor}00,${brand.secondaryColor}55,${brand.secondaryColor}00); margin:40px 0; border-radius:3px; flex-shrink:0; }
  .img-col { width:46%; display:flex; align-items:center; justify-content:center; padding:40px 48px; }
  .scene-image { max-width:100%; max-height:800px; object-fit:contain; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${headerHtml(theme, brand.primaryColor, brand.secondaryColor, scene.title ?? '', badge)}
<div class="body-row">
  ${imgLeft ? imgCol : textCol}
  <div class="divider"></div>
  ${imgLeft ? textCol : imgCol}
</div>
${footerHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
}
