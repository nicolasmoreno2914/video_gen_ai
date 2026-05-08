import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, footerHtml, headerHtml, bulletFontSize } from './shared';

export function buildExampleCardTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand, imageBase64, requiresAiImage } = data;
  const bullets = (scene.on_screen_text ?? []).slice(0, 3);
  const hasImage = requiresAiImage && !!imageBase64;
  const fontSize = bulletFontSize(bullets, 34, 22);
  const gap = bullets.length >= 3 ? 20 : 28;

  const bulletHtml = bullets.map(b =>
    `<div style="display:flex;align-items:flex-start;gap:18px;margin-bottom:${gap}px">
      <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${brand.secondaryColor};flex-shrink:0;margin-top:${Math.round(fontSize * 0.35)}px"></span>
      <span style="font-family:'Inter',sans-serif;font-size:${fontSize}px;color:#1A1A1A;line-height:1.45">${escape(b)}</span>
    </div>`
  ).join('');

  // Left panel: image (cover) or gradient decoration with lightbulb shape
  const leftPanel = hasImage
    ? `<div style="width:56%;position:relative;overflow:hidden;flex-shrink:0">
        <img style="width:100%;height:100%;object-fit:cover" src="data:image/png;base64,${imageBase64}" alt="scene">
        <div style="position:absolute;inset:0;background:linear-gradient(to right,transparent 60%,#fff 100%)"></div>
      </div>`
    : `<div style="width:56%;background:linear-gradient(135deg,${brand.primaryColor},${brand.secondaryColor});display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;flex-shrink:0">
        <div style="position:relative;width:140px;height:140px">
          <div style="width:140px;height:140px;border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;background:#fff;opacity:0.15"></div>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">
              <circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
              <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
              <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
            </svg>
          </div>
        </div>
        <div style="font-family:'Nunito',sans-serif;font-size:28px;font-weight:700;color:#fff;letter-spacing:1px;opacity:0.85">CASO REAL</div>
      </div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:#fff; font-family:'Nunito',sans-serif; display:flex; flex-direction:column; }
  .grid-bg { position:fixed; inset:0; ${bgStyle(theme)} opacity:0.55; z-index:0; }
  .header { height:110px; display:flex; align-items:center; padding:0 70px; gap:20px; position:relative; z-index:1; }
  .scene-title { font-weight:700; flex:1; }
  .body { flex:1; display:flex; position:relative; z-index:1; }
  .text-panel { flex:1; display:flex; flex-direction:column; justify-content:center; padding:52px 70px 52px 48px; gap:28px; }
  .case-badge { background:${brand.secondaryColor}; color:#fff; font-family:'Inter',sans-serif; font-size:18px; font-weight:700; padding:8px 22px; border-radius:30px; width:fit-content; letter-spacing:1px; }
  .footer { height:100px; border-top:2px solid #f0f0f0; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; }
  .watermark { display:flex; align-items:center; gap:10px; opacity:0.45; }
  .watermark img { max-height:36px; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:16px; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${headerHtml(theme, brand.primaryColor, brand.secondaryColor, scene.title ?? '', 'EJEMPLO PRÁCTICO')}
<div class="body">
  ${leftPanel}
  <div class="text-panel">
    <div class="case-badge">CASO REAL</div>
    ${bulletHtml}
  </div>
</div>
${footerHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
}
