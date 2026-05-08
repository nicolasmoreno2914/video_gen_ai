import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, watermarkHtml, adaptiveTitleSize } from './shared';

export function buildTitleTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand, imageBase64 } = data;
  const bgImage = imageBase64 ? `url('data:image/png;base64,${imageBase64}')` : 'none';
  const bullets = (scene.on_screen_text ?? []).slice(0, 3);

  const titleSize = adaptiveTitleSize(scene.title ?? '', 96, 56);

  // Trim subtitle to first sentence and cap at 120 chars
  const rawSub = (scene.narration ?? '').split('.')[0] ?? '';
  const subtitle = rawSub.length > 120 ? rawSub.substring(0, 117) + '…' : rawSub;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:#fff; font-family:'Nunito',sans-serif; position:relative; }
  .grid-bg { position:absolute; inset:0; ${bgStyle(theme)} opacity:0.55; }
  .doodle-bg { position:absolute; inset:0; background-image:${bgImage}; background-size:cover; background-position:center; opacity:0.08; }
  .top-bar { position:absolute; top:0; left:0; right:0; height:10px; background:${brand.primaryColor}; }
  .bottom-bar { position:absolute; bottom:0; left:0; right:0; height:10px; background:${brand.primaryColor}; }
  .left-accent { position:absolute; left:0; top:10px; bottom:10px; width:8px; background:linear-gradient(to bottom,${brand.primaryColor},${brand.secondaryColor}); }
  .center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 180px; text-align:center; }
  .institution-badge { background:${brand.secondaryColor}; color:#fff; font-family:'Inter',sans-serif; font-size:22px; font-weight:700; padding:10px 32px; border-radius:40px; margin-bottom:44px; }
  .title { font-size:${titleSize}px; font-weight:900; color:#1A1A1A; line-height:1.05; margin-bottom:36px; max-width:1440px; }
  .subtitle { font-family:'Inter',sans-serif; font-size:34px; color:#555; max-width:1200px; line-height:1.45; }
  .bullets { margin-top:32px; display:flex; flex-direction:column; align-items:center; gap:10px; }
  .bullet-item { font-family:'Inter',sans-serif; font-size:28px; color:#666; }
  .watermark { position:absolute; bottom:28px; right:36px; display:flex; align-items:center; gap:12px; opacity:0.4; z-index:10; }
  .watermark img { max-height:44px; object-fit:contain; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:16px; color:#1A1A1A; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${imageBase64 ? '<div class="doodle-bg"></div>' : ''}
<div class="top-bar"></div>
<div class="bottom-bar"></div>
<div class="left-accent"></div>
<div class="center">
  <div class="institution-badge">${escape(brand.institutionName)}</div>
  <div class="title">${escape(scene.title ?? '')}</div>
  ${subtitle ? `<div class="subtitle">${escape(subtitle)}</div>` : ''}
  ${bullets.length > 0
    ? `<div class="bullets">${bullets.map(b => `<div class="bullet-item">${escape(b)}</div>`).join('')}</div>`
    : ''}
</div>
${watermarkHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
}
