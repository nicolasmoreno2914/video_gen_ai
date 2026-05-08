import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, footerHtml, adaptiveTitleSize } from './shared';
import { radiusValue } from '../theme';

export function buildQuestionTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand, imageBase64 } = data;
  const radius = radiusValue(theme);
  const questionSize = adaptiveTitleSize(scene.title ?? '', 72, 44);
  const hint = scene.on_screen_text?.[0] ?? null;

  const rightPanel = imageBase64
    ? `<img style="max-width:100%;max-height:700px;object-fit:contain;border-radius:${radius}" src="data:image/png;base64,${imageBase64}" alt="scene">`
    : `<div style="position:relative;width:420px;height:420px;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;width:420px;height:420px;border-radius:50%;border:3px solid ${brand.primaryColor}12"></div>
        <div style="position:absolute;width:300px;height:300px;border-radius:50%;border:3px solid ${brand.secondaryColor}20"></div>
        <div style="position:absolute;width:180px;height:180px;border-radius:50%;background:${brand.secondaryColor}10;border:3px solid ${brand.secondaryColor}35"></div>
        <div style="font-size:96px;font-weight:900;color:${brand.primaryColor};opacity:0.18;line-height:1;font-family:'Nunito',sans-serif">?</div>
      </div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:#fff; font-family:'Nunito',sans-serif; display:flex; flex-direction:column; position:relative; }
  .grid-bg { position:fixed; inset:0; ${bgStyle(theme)} opacity:0.55; z-index:0; }
  .big-q { position:absolute; right:80px; top:50%; transform:translateY(-55%); font-size:520px; font-weight:900; color:${brand.primaryColor}; opacity:0.04; line-height:1; z-index:0; user-select:none; font-family:'Nunito',sans-serif; }
  .top-bar { height:10px; background:${brand.primaryColor}; position:relative; z-index:1; }
  .body { flex:1; display:flex; align-items:center; position:relative; z-index:1; }
  .left { width:56%; padding:70px 60px 70px 100px; display:flex; flex-direction:column; gap:36px; justify-content:center; }
  .tag { background:${brand.secondaryColor}; color:#fff; font-family:'Inter',sans-serif; font-size:20px; font-weight:700; padding:10px 28px; border-radius:30px; width:fit-content; letter-spacing:1px; }
  .question { font-weight:900; color:#1A1A1A; line-height:1.1; }
  .hint { font-family:'Inter',sans-serif; font-size:32px; color:#555; line-height:1.45; }
  .right { width:44%; display:flex; align-items:center; justify-content:center; padding:52px; }
  .bottom-bar { height:10px; background:${brand.primaryColor}; position:relative; z-index:1; }
  .footer { height:100px; border-top:2px solid #f0f0f0; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; }
  .watermark { display:flex; align-items:center; gap:10px; opacity:0.45; }
  .watermark img { max-height:36px; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:16px; }
</style>
</head>
<body>
<div class="grid-bg"></div>
<div class="big-q">?</div>
<div class="top-bar"></div>
<div class="body">
  <div class="left">
    <div class="tag">PREGUNTA CLAVE</div>
    <div class="question" style="font-size:${questionSize}px">${escape(scene.title ?? '')}</div>
    ${hint ? `<div class="hint">${escape(hint)}</div>` : ''}
  </div>
  <div class="right">${rightPanel}</div>
</div>
<div class="bottom-bar"></div>
${footerHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
}
