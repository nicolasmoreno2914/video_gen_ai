import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, footerHtml, headerHtml, buildBullets, radiusValue, bulletFontSize } from './shared';

export function buildContentTemplate(data: SlideTemplateData, theme: VideoTheme, badge?: string): string {
  const { scene, brand, imageBase64, requiresAiImage } = data;
  const bullets = (scene.on_screen_text ?? []).slice(0, 5);
  const highlights = scene.highlight_words ?? [];
  const radius = radiusValue(theme);
  const imgLeft = theme.imagePosition === 'left';
  const hasImage = requiresAiImage && !!imageBase64;
  const fontSize = bulletFontSize(bullets);

  const bulletHtml = buildBullets(bullets, theme, brand.secondaryColor, highlights);

  const baseCSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:#fff; font-family:'Nunito',sans-serif; display:flex; flex-direction:column; }
  .grid-bg { position:fixed; inset:0; ${bgStyle(theme)} opacity:0.55; z-index:0; }
  .header { height:110px; display:flex; align-items:center; padding:0 70px; gap:20px; position:relative; z-index:1; }
  .scene-title { font-weight:700; flex:1; }
  .footer { height:100px; border-top:2px solid #f0f0f0; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; }
  .watermark { display:flex; align-items:center; gap:10px; opacity:0.45; }
  .watermark img { max-height:36px; object-fit:contain; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:16px; }`;

  if (!requiresAiImage) {
    // Full-width layout: accent bar left, bullets centered
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  ${baseCSS}
  .body-row { flex:1; display:flex; position:relative; z-index:1; align-items:stretch; }
  .accent-bar { width:10px; background:linear-gradient(to bottom,${brand.primaryColor},${brand.secondaryColor}); margin:44px 0; border-radius:0 5px 5px 0; flex-shrink:0; }
  .text-col { flex:1; padding:52px 100px 52px 60px; display:flex; flex-direction:column; justify-content:center; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${headerHtml(theme, brand.primaryColor, brand.secondaryColor, scene.title ?? '', badge)}
<div class="body-row">
  <div class="accent-bar"></div>
  <div class="text-col">${bulletHtml}</div>
</div>
${footerHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
  }

  // Split layout with image
  const textCol = `<div class="text-col">${bulletHtml}</div>`;
  const imgCol = `<div class="img-col">
    ${hasImage
      ? `<img class="scene-image" style="border-radius:${radius}" src="data:image/png;base64,${imageBase64}" alt="scene">`
      : `<div style="width:100%;height:560px;border-radius:${radius};background:${brand.secondaryColor}18"></div>`}
  </div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  ${baseCSS}
  .body-row { flex:1; display:flex; position:relative; z-index:1; flex-direction:${imgLeft ? 'row-reverse' : 'row'}; align-items:stretch; }
  .text-col { width:54%; padding:52px 48px 52px 70px; display:flex; flex-direction:column; justify-content:center; }
  .divider { width:3px; background:linear-gradient(to bottom,${brand.secondaryColor}00,${brand.secondaryColor}60,${brand.secondaryColor}00); margin:44px 0; border-radius:3px; flex-shrink:0; }
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
