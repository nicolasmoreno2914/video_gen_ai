import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, footerHtml, headerHtml, radiusValue, bulletFontSize, lerpColor } from './shared';

function statNumberSize(statValue: string): number {
  const len = statValue.replace(/\s/g, '').length;
  if (len <= 3)  return 240;
  if (len <= 5)  return 200;
  if (len <= 7)  return 160;
  return 120;
}

export function buildBigStatTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand, imageBase64, requiresAiImage } = data;
  const texts = scene.on_screen_text ?? [];
  const radius = radiusValue(theme);

  const first = texts[0] ?? '';
  const statMatch = first.match(/^([$€+\-]?\s*[0-9][0-9.,]*\s*[%$€kmKMBbx×]?)/);
  const statValue = statMatch ? statMatch[1].trim() : first.substring(0, 16);
  const statLabel = statMatch ? first.substring(statMatch[0].length).trim() : '';
  const restItems = texts.slice(1, 4);
  const numSize = statNumberSize(statValue);
  const restFontSize = bulletFontSize(restItems, 28, 20);

  const supportCards = restItems.length > 0
    ? `<div style="display:flex;flex-direction:column;gap:14px;margin-top:24px">
        ${restItems.map((b, i) => {
          const t = i / Math.max(restItems.length - 1, 1);
          const color = lerpColor(brand.primaryColor, brand.secondaryColor, t);
          return `
          <div style="
            display:flex; align-items:center; gap:16px;
            background:white;
            border-left:5px solid ${color};
            border-radius:0 ${radius} ${radius} 0;
            box-shadow:0 2px 12px rgba(0,0,0,0.07);
            padding:14px 24px 14px 20px;
          ">
            <div style="
              width:28px; height:28px; min-width:28px; border-radius:50%;
              background:${color}18; border:2px solid ${color}50;
              display:flex; align-items:center; justify-content:center; flex-shrink:0;
            ">
              <div style="width:8px;height:8px;border-radius:50%;background:${color}"></div>
            </div>
            <span style="
              font-family:'Inter',sans-serif;
              font-size:${restFontSize}px;
              font-weight:500; color:#333; line-height:1.4;
            ">${escape(b)}</span>
          </div>`;
        }).join('')}
      </div>`
    : '';

  const statBlock = `
    <div style="
      display:inline-block;
      background:${brand.secondaryColor};
      color:#fff;
      font-family:'Inter',sans-serif;
      font-size:18px; font-weight:700;
      padding:9px 28px; border-radius:30px;
      letter-spacing:1.5px;
      box-shadow:0 3px 12px ${brand.secondaryColor}50;
    ">DATO CLAVE</div>

    <div style="
      font-size:${numSize}px;
      font-weight:900;
      line-height:0.88;
      color:${brand.primaryColor};
      font-family:'Nunito',sans-serif;
      text-shadow:0 4px 32px ${brand.primaryColor}30;
      margin:12px 0 4px;
    ">${escape(statValue)}</div>

    ${statLabel
      ? `<div style="
          font-family:'Inter',sans-serif;
          font-size:38px; color:#333;
          line-height:1.3; max-width:720px;
          font-weight:500;
        ">${escape(statLabel)}</div>`
      : ''}
    ${supportCards}
  `;

  const baseCSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:#f5f7fa; font-family:'Nunito',sans-serif; display:flex; flex-direction:column; }
  .grid-bg { position:fixed; inset:0; ${bgStyle(theme)} opacity:0.45; z-index:0; }
  .footer { height:88px; border-top:1px solid #e5e8ec; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; background:white; }
  .watermark { display:flex; align-items:center; gap:10px; opacity:0.45; }
  .watermark img { max-height:36px; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:16px; }`;

  // Decorative concentric rings element
  const decoRings = `
    <div style="position:relative; width:440px; height:440px; flex-shrink:0;">
      <!-- Outer ring -->
      <div style="
        position:absolute; inset:0; border-radius:50%;
        border:3px solid ${brand.primaryColor}18;
      "></div>
      <!-- Mid ring -->
      <div style="
        position:absolute; inset:60px; border-radius:50%;
        border:3px solid ${brand.secondaryColor}28;
      "></div>
      <!-- Inner ring -->
      <div style="
        position:absolute; inset:130px; border-radius:50%;
        background:linear-gradient(135deg,${brand.primaryColor}12,${brand.secondaryColor}18);
        border:3px solid ${brand.secondaryColor}40;
      "></div>
      <!-- Center dot -->
      <div style="
        position:absolute; inset:190px; border-radius:50%;
        background:${brand.secondaryColor}35;
      "></div>
      <!-- Corner accent -->
      <div style="
        position:absolute; top:20px; right:20px;
        width:40px; height:40px; border-radius:50%;
        background:${brand.primaryColor}25;
      "></div>
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
  ${baseCSS}
  .body { flex:1; display:flex; position:relative; z-index:1; align-items:center; }
  .stat-col { flex:1; display:flex; flex-direction:column; justify-content:center; padding:52px 60px 52px 100px; gap:20px; }
  .deco-col { width:480px; display:flex; align-items:center; justify-content:center; flex-shrink:0; position:relative; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${headerHtml(theme, brand.primaryColor, brand.secondaryColor, scene.title ?? '')}
<div class="body">
  <div class="stat-col">${statBlock}</div>
  <div class="deco-col">${decoRings}</div>
</div>
${footerHtml(brand.logoUrl, brand.institutionName)}
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
  ${baseCSS}
  .body { flex:1; display:flex; position:relative; z-index:1; }
  .stat-col { width:54%; display:flex; flex-direction:column; justify-content:center; padding:52px 40px 52px 100px; gap:20px; }
  .img-col { width:46%; display:flex; align-items:center; justify-content:center; padding:44px; }
  .scene-image { max-width:100%; max-height:800px; object-fit:contain; border-radius:${radius}; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${headerHtml(theme, brand.primaryColor, brand.secondaryColor, scene.title ?? '')}
<div class="body">
  <div class="stat-col">${statBlock}</div>
  <div class="img-col">
    <img class="scene-image" src="data:image/png;base64,${imageBase64}" alt="scene">
  </div>
</div>
${footerHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
}
