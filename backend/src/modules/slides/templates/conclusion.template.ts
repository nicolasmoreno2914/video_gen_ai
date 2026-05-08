import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, radiusValue, bulletFontSize } from './shared';

export function buildConclusionTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand, imageBase64 } = data;
  const bullets = (scene.on_screen_text ?? []).slice(0, 4);
  const bgImage = imageBase64 ? `url('data:image/png;base64,${imageBase64}')` : 'none';
  const radius = radiusValue(theme);
  const fontSize = bulletFontSize(bullets, 34, 22);
  const gap = bullets.length >= 4 ? 16 : 24;

  const bulletHtml = bullets.map(b =>
    `<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:${gap}px">
      <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${brand.secondaryColor};flex-shrink:0;margin-top:${Math.round(fontSize * 0.32)}px"></span>
      <span style="font-family:'Inter',sans-serif;font-size:${fontSize}px;color:#444;line-height:1.45">${escape(b)}</span>
    </div>`
  ).join('');

  const titleSize = Math.max(44, Math.min(62, 72 - Math.floor((scene.title ?? '').length / 4)));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:${brand.primaryColor}; font-family:'Nunito',sans-serif; display:flex; align-items:center; justify-content:center; position:relative; }
  .doodle-bg { position:absolute; inset:0; background-image:${bgImage}; background-size:cover; background-position:center; opacity:0.06; }
  .deco-circle { position:absolute; width:700px; height:700px; border-radius:50%; border:2px solid #ffffff10; top:-120px; right:-120px; }
  .deco-circle-2 { position:absolute; width:400px; height:400px; border-radius:50%; border:2px solid #ffffff08; bottom:-60px; left:-60px; }
  .card { position:relative; z-index:1; background:#fff; border-radius:${radius}; padding:64px 80px; max-width:1380px; width:88%; display:flex; flex-direction:column; gap:36px; box-shadow:0 20px 60px rgba(0,0,0,0.25); }
  .reflex-badge { background:${brand.secondaryColor}; color:#fff; font-family:'Inter',sans-serif; font-size:18px; font-weight:700; letter-spacing:2px; padding:8px 24px; border-radius:30px; width:fit-content; }
  .card-title { font-weight:900; color:#1A1A1A; line-height:1.1; }
  .watermark { position:absolute; bottom:24px; right:32px; display:flex; align-items:center; gap:10px; opacity:0.35; z-index:2; }
  .watermark img { max-height:32px; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:15px; color:#fff; }
</style>
</head>
<body>
${imageBase64 ? '<div class="doodle-bg"></div>' : ''}
<div class="deco-circle"></div>
<div class="deco-circle-2"></div>
<div class="card">
  <div class="reflex-badge">REFLEXIÓN FINAL</div>
  <div class="card-title" style="font-size:${titleSize}px">${escape(scene.title ?? '')}</div>
  <div>${bulletHtml}</div>
</div>
<div class="watermark">
  ${brand.logoUrl ? `<img src="${brand.logoUrl}" alt="logo">` : ''}
  <span class="watermark-name">${escape(brand.institutionName)}</span>
</div>
</body>
</html>`;
}
