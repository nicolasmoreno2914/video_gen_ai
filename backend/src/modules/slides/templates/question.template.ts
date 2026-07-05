import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, footerHtml, adaptiveTitleSize } from './shared';
import { radiusValue } from '../theme';

export function buildQuestionTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand, imageBase64 } = data;
  const radius = radiusValue(theme);
  const questionSize = adaptiveTitleSize(scene.title ?? '', 72, 44);
  const hint = scene.on_screen_text?.[0] ?? null;

  // Right panel: image or decorative rings with question mark
  const rightPanel = imageBase64
    ? `<img style="max-width:100%;max-height:700px;object-fit:contain;border-radius:${radius};box-shadow:0 8px 40px rgba(0,0,0,0.12)" src="data:image/png;base64,${imageBase64}" alt="scene">`
    : `<div style="position:relative;width:460px;height:460px;display:flex;align-items:center;justify-content:center">
        <!-- Outer ring -->
        <div style="
          position:absolute; inset:0; border-radius:50%;
          border:3px solid ${brand.primaryColor}18;
        "></div>
        <!-- Mid ring (animated-feel via color) -->
        <div style="
          position:absolute; inset:55px; border-radius:50%;
          border:3px solid ${brand.secondaryColor}28;
        "></div>
        <!-- Inner filled circle -->
        <div style="
          position:absolute; inset:130px; border-radius:50%;
          background:linear-gradient(135deg, ${brand.primaryColor}12, ${brand.secondaryColor}20);
          border:3px solid ${brand.secondaryColor}40;
          box-shadow:0 4px 20px ${brand.secondaryColor}20;
        "></div>
        <!-- Question mark -->
        <div style="
          font-size:160px; font-weight:900;
          color:${brand.primaryColor}; opacity:0.22;
          line-height:1; font-family:'Nunito',sans-serif;
          position:relative; z-index:1;
          user-select:none;
        ">?</div>
        <!-- Corner accent dots -->
        <div style="
          position:absolute; top:32px; right:48px;
          width:18px; height:18px; border-radius:50%;
          background:${brand.secondaryColor}40;
        "></div>
        <div style="
          position:absolute; bottom:48px; left:40px;
          width:12px; height:12px; border-radius:50%;
          background:${brand.primaryColor}30;
        "></div>
      </div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1920px; height:1080px; overflow:hidden;
    background:#f5f7fa; font-family:'Nunito',sans-serif;
    display:flex; flex-direction:column; position:relative;
  }
  .grid-bg { position:fixed; inset:0; ${bgStyle(theme)} opacity:0.40; z-index:0; }

  /* Large ghosted "?" in background */
  .big-q {
    position:absolute; right:60px; top:50%;
    transform:translateY(-52%);
    font-size:600px; font-weight:900;
    color:${brand.primaryColor}; opacity:0.035;
    line-height:1; z-index:0;
    user-select:none; font-family:'Nunito',sans-serif;
    pointer-events:none;
  }

  /* Top accent bar */
  .top-bar {
    height:8px;
    background:linear-gradient(to right, ${brand.primaryColor}, ${brand.secondaryColor});
    position:relative; z-index:1;
  }

  .body {
    flex:1; display:flex; align-items:center;
    position:relative; z-index:1;
  }
  .left {
    width:58%; padding:60px 56px 60px 100px;
    display:flex; flex-direction:column; gap:28px;
    justify-content:center;
  }

  .tag {
    display:inline-flex; align-items:center; gap:10px;
    background:${brand.secondaryColor};
    color:#fff; font-family:'Inter',sans-serif;
    font-size:20px; font-weight:700;
    padding:10px 28px; border-radius:30px;
    width:fit-content; letter-spacing:1px;
    box-shadow:0 3px 14px ${brand.secondaryColor}55;
  }
  .question {
    font-weight:900; color:#1A1A1A; line-height:1.08;
  }
  .hint-card {
    background:white;
    border-left:5px solid ${brand.secondaryColor};
    border-radius:0 12px 12px 0;
    box-shadow:0 2px 16px rgba(0,0,0,0.08);
    padding:20px 32px;
    display:flex; align-items:flex-start; gap:16px;
  }
  .hint-dot {
    width:10px; height:10px; min-width:10px; border-radius:50%;
    background:${brand.secondaryColor}; flex-shrink:0; margin-top:8px;
  }
  .hint-text {
    font-family:'Inter',sans-serif;
    font-size:30px; color:#444; line-height:1.45;
  }

  .right {
    width:42%; display:flex; align-items:center;
    justify-content:center; padding:52px;
  }

  /* Bottom accent bar */
  .bottom-bar {
    height:8px;
    background:linear-gradient(to right, ${brand.primaryColor}, ${brand.secondaryColor});
    position:relative; z-index:1;
  }

  .footer { height:88px; border-top:1px solid #e5e8ec; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; background:white; }
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
    <div class="tag">
      <!-- Question mark icon -->
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" stroke="white" stroke-width="1.8"/>
        <path d="M7.5 7.5C7.5 6.12 8.62 5 10 5s2.5 1.12 2.5 2.5c0 1.5-2.5 2-2.5 3.5" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="10" cy="14.5" r="0.8" fill="white"/>
      </svg>
      PREGUNTA CLAVE
    </div>
    <div class="question" style="font-size:${questionSize}px">${escape(scene.title ?? '')}</div>
    ${hint
      ? `<div class="hint-card">
          <div class="hint-dot"></div>
          <div class="hint-text">${escape(hint)}</div>
        </div>`
      : ''}
  </div>
  <div class="right">${rightPanel}</div>
</div>
<div class="bottom-bar"></div>
${footerHtml(brand.logoBase64, brand.institutionName)}
</body>
</html>`;
}
