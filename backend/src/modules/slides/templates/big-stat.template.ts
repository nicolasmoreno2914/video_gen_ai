import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, footerHtml, headerHtml, radiusValue, bulletFontSize } from './shared';

function statNumberSize(statValue: string): number {
  const len = statValue.replace(/\s/g, '').length;
  if (len <= 3) return 220;
  if (len <= 5) return 180;
  if (len <= 7) return 140;
  return 110;
}

export function buildBigStatTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand, imageBase64, requiresAiImage } = data;
  const texts = scene.on_screen_text ?? [];
  const radius = radiusValue(theme);

  const first = texts[0] ?? '';
  const statMatch = first.match(/^([0-9][0-9.,]*\s*[%$€kmKMB+x×]?)/);
  const statValue = statMatch ? statMatch[1].trim() : first.substring(0, 16);
  const statLabel = statMatch ? first.substring(statMatch[0].length).trim() : '';
  const restItems = texts.slice(1, 4);
  const numSize = statNumberSize(statValue);
  const restFontSize = bulletFontSize(restItems, 30, 20);

  const statBlock = `
    <div style="background:${brand.secondaryColor};color:#fff;font-family:'Inter',sans-serif;font-size:18px;font-weight:700;padding:8px 24px;border-radius:30px;width:fit-content;letter-spacing:1.5px">DATO CLAVE</div>
    <div style="font-size:${numSize}px;font-weight:900;line-height:0.9;color:${brand.primaryColor};font-family:'Nunito',sans-serif">${escape(statValue)}</div>
    ${statLabel ? `<div style="font-family:'Inter',sans-serif;font-size:38px;color:#333;line-height:1.3;max-width:680px">${escape(statLabel)}</div>` : ''}
    ${restItems.length > 0
      ? `<div style="margin-top:20px;display:flex;flex-direction:column;gap:14px">
          ${restItems.map(b =>
            `<div style="display:flex;align-items:flex-start;gap:12px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${brand.secondaryColor};flex-shrink:0;margin-top:${Math.round(restFontSize * 0.4)}px"></span>
              <span style="font-family:'Inter',sans-serif;font-size:${restFontSize}px;color:#555;line-height:1.45">${escape(b)}</span>
            </div>`
          ).join('')}
        </div>`
      : ''}`;

  const baseCSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:#fff; font-family:'Nunito',sans-serif; display:flex; flex-direction:column; }
  .grid-bg { position:fixed; inset:0; ${bgStyle(theme)} opacity:0.55; z-index:0; }
  .header { height:110px; display:flex; align-items:center; padding:0 70px; gap:20px; position:relative; z-index:1; }
  .scene-title { font-weight:700; flex:1; }
  .footer { height:100px; border-top:2px solid #f0f0f0; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; }
  .watermark { display:flex; align-items:center; gap:10px; opacity:0.45; }
  .watermark img { max-height:36px; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:16px; }`;

  if (!requiresAiImage) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  ${baseCSS}
  .body { flex:1; display:flex; position:relative; z-index:1; align-items:center; }
  .stat-col { flex:1; display:flex; flex-direction:column; justify-content:center; padding:60px 60px 60px 100px; gap:24px; }
  .deco-col { width:460px; display:flex; align-items:center; justify-content:center; position:relative; flex-shrink:0; }
  .ring { position:absolute; border-radius:50%; border:3px solid; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${headerHtml(theme, brand.primaryColor, brand.secondaryColor, scene.title ?? '')}
<div class="body">
  <div class="stat-col">${statBlock}</div>
  <div class="deco-col">
    <div class="ring" style="width:380px;height:380px;border-color:${brand.primaryColor}20"></div>
    <div class="ring" style="width:260px;height:260px;border-color:${brand.secondaryColor}30"></div>
    <div class="ring" style="width:140px;height:140px;background:${brand.secondaryColor}12;border-color:${brand.secondaryColor}45"></div>
  </div>
</div>
${footerHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  ${baseCSS}
  .body { flex:1; display:flex; position:relative; z-index:1; }
  .stat-col { width:54%; display:flex; flex-direction:column; justify-content:center; padding:60px 40px 60px 100px; gap:24px; }
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
    ${imageBase64 ? `<img class="scene-image" src="data:image/png;base64,${imageBase64}" alt="scene">` : ''}
  </div>
</div>
${footerHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
}
