import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, footerHtml, bulletFontSize } from './shared';

export function buildSummaryTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand, imageBase64, requiresAiImage } = data;
  const bullets = (scene.on_screen_text ?? []).slice(0, 5);
  const hasImage = requiresAiImage && !!imageBase64;
  const fontSize = bulletFontSize(bullets, 36, 24);
  const gap = bullets.length >= 5 ? 16 : 24;

  const bulletHtml = bullets.map(b =>
    `<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:${gap}px">
      <div style="width:32px;height:32px;border-radius:50%;border:3px solid ${brand.secondaryColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:${Math.round(fontSize * 0.12)}px">
        <div style="width:10px;height:6px;border-left:3px solid ${brand.secondaryColor};border-bottom:3px solid ${brand.secondaryColor};transform:rotate(-45deg);margin-bottom:3px"></div>
      </div>
      <span style="font-family:'Inter',sans-serif;font-size:${fontSize}px;color:#1A1A1A;line-height:1.45">${escape(b)}</span>
    </div>`
  ).join('');

  const gridBg = `background-image:linear-gradient(#d8f5e8 1px,transparent 1px),linear-gradient(90deg,#d8f5e8 1px,transparent 1px);background-size:40px 40px;opacity:0.7`;

  if (!requiresAiImage) {
    // Full-width with decorative right column
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:#F2FFF8; font-family:'Nunito',sans-serif; display:flex; flex-direction:column; }
  .grid-bg { position:fixed; inset:0; ${gridBg}; z-index:0; }
  .header { height:110px; display:flex; align-items:center; padding:0 70px; gap:20px; position:relative; z-index:1; background:${brand.primaryColor}; }
  .header-icon { color:#fff; font-size:36px; }
  .scene-title { font-weight:700; flex:1; color:#fff; }
  .body-row { flex:1; display:flex; position:relative; z-index:1; }
  .left-col { flex:1; padding:52px 60px 52px 100px; display:flex; flex-direction:column; justify-content:center; }
  .right-deco { width:360px; display:flex; align-items:center; justify-content:center; padding:60px; flex-shrink:0; }
  .deco-ring { width:240px; height:240px; border-radius:50%; border:6px solid ${brand.primaryColor}25; display:flex; align-items:center; justify-content:center; }
  .deco-inner { width:160px; height:160px; border-radius:50%; background:${brand.primaryColor}12; border:4px solid ${brand.primaryColor}30; display:flex; align-items:center; justify-content:center; }
  .deco-dot { width:60px; height:60px; border-radius:50%; background:${brand.primaryColor}40; }
  .footer { height:100px; border-top:2px solid #b8ecd0; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; }
  .watermark { display:flex; align-items:center; gap:10px; opacity:0.45; }
  .watermark img { max-height:36px; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:16px; }
</style>
</head>
<body>
<div class="grid-bg"></div>
<div class="header">
  <div class="scene-title" style="font-size:42px">${escape(scene.title ?? 'En resumen')}</div>
</div>
<div class="body-row">
  <div class="left-col">${bulletHtml}</div>
  <div class="right-deco">
    <div class="deco-ring">
      <div class="deco-inner">
        <div class="deco-dot"></div>
      </div>
    </div>
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
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:#F2FFF8; font-family:'Nunito',sans-serif; display:flex; flex-direction:column; }
  .grid-bg { position:fixed; inset:0; ${gridBg}; z-index:0; }
  .header { height:110px; display:flex; align-items:center; padding:0 70px; gap:20px; position:relative; z-index:1; background:${brand.primaryColor}; }
  .scene-title { font-weight:700; flex:1; color:#fff; }
  .body-row { flex:1; display:flex; position:relative; z-index:1; }
  .left-col { width:54%; padding:52px 44px 52px 70px; display:flex; flex-direction:column; justify-content:center; }
  .divider { width:3px; background:linear-gradient(to bottom,${brand.secondaryColor}00,${brand.secondaryColor}60,${brand.secondaryColor}00); margin:40px 0; border-radius:3px; flex-shrink:0; }
  .right-col { width:46%; display:flex; align-items:center; justify-content:center; padding:40px; }
  .scene-image { max-width:100%; max-height:780px; object-fit:contain; border-radius:16px; }
  .footer { height:100px; border-top:2px solid #b8ecd0; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; }
  .watermark { display:flex; align-items:center; gap:10px; opacity:0.45; }
  .watermark img { max-height:36px; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:16px; }
</style>
</head>
<body>
<div class="grid-bg"></div>
<div class="header">
  <div class="scene-title" style="font-size:42px">${escape(scene.title ?? 'En resumen')}</div>
</div>
<div class="body-row">
  <div class="left-col">${bulletHtml}</div>
  <div class="divider"></div>
  <div class="right-col">
    ${hasImage ? `<img class="scene-image" src="data:image/png;base64,${imageBase64}" alt="scene">` : ''}
  </div>
</div>
${footerHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
}
