import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, watermarkHtml, adaptiveTitleSize } from './shared';

export function buildTitleTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand, imageBase64 } = data;
  const bullets = (scene.on_screen_text ?? []).slice(0, 3);

  const titleSize = adaptiveTitleSize(scene.title ?? '', 92, 52);

  // Subtitle: first sentence from narration, capped at 130 chars
  const rawSub = (scene.narration ?? '').split('.')[0] ?? '';
  const subtitle = rawSub.length > 130 ? rawSub.substring(0, 127) + '…' : rawSub;

  // Determine if primary color is dark enough for white text
  function needsWhiteText(hex: string): boolean {
    const c = hex.replace('#', '');
    if (c.length !== 6) return true;
    const r = parseInt(c.slice(0, 2), 16) / 255;
    const g = parseInt(c.slice(2, 4), 16) / 255;
    const b = parseInt(c.slice(4, 6), 16) / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum < 0.55;
  }
  const panelTextColor = needsWhiteText(brand.primaryColor) ? '#fff' : '#1A1A1A';

  // If we have a background image, use it as a subtle texture
  const bgImageStyle = imageBase64
    ? `url('data:image/png;base64,${imageBase64}')`
    : 'none';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1920px; height:1080px; overflow:hidden; background:#fff;
    font-family:'Nunito',sans-serif; display:flex;
    -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
  }

  /* Left hero panel */
  .hero-panel {
    width:480px; min-width:480px;
    background:linear-gradient(160deg, ${brand.primaryColor} 0%, ${brand.secondaryColor} 100%);
    display:flex; flex-direction:column;
    align-items:flex-start; justify-content:space-between;
    padding:64px 52px;
    position:relative; overflow:hidden;
    flex-shrink:0;
  }
  /* Decorative circles inside hero panel */
  .hero-deco-lg {
    position:absolute; width:480px; height:480px; border-radius:50%;
    border:2px solid rgba(255,255,255,0.12);
    top:-140px; right:-200px; pointer-events:none;
  }
  .hero-deco-sm {
    position:absolute; width:260px; height:260px; border-radius:50%;
    border:2px solid rgba(255,255,255,0.09);
    bottom:-80px; left:-80px; pointer-events:none;
  }
  .hero-deco-dot {
    position:absolute; width:80px; height:80px; border-radius:50%;
    background:rgba(255,255,255,0.10);
    bottom:180px; right:48px; pointer-events:none;
  }

  /* Institution label at top of hero panel */
  .institution-label {
    font-family:'Inter',sans-serif;
    font-size:19px; font-weight:700;
    color:rgba(255,255,255,0.80);
    letter-spacing:2px;
    text-transform:uppercase;
    position:relative; z-index:1;
  }
  .course-badge {
    background:rgba(255,255,255,0.22);
    border:1.5px solid rgba(255,255,255,0.40);
    color:#fff;
    font-family:'Inter',sans-serif;
    font-size:17px; font-weight:700;
    padding:9px 24px; border-radius:30px;
    letter-spacing:1.5px;
    position:relative; z-index:1;
  }

  /* Vertical accent line divider */
  .divider-line {
    width:5px; min-width:5px;
    background:linear-gradient(to bottom, ${brand.primaryColor}, ${brand.secondaryColor});
  }

  /* Right content panel */
  .content-panel {
    flex:1;
    display:flex; flex-direction:column;
    justify-content:center;
    padding:72px 100px 72px 80px;
    position:relative;
    background:#ffffff;
  }
  /* Subtle theme pattern on right side */
  .content-bg {
    position:absolute; inset:0;
    ${bgStyle(theme)}
    opacity:0.35;
    pointer-events:none;
  }
  /* Image texture overlay */
  .img-texture {
    position:absolute; inset:0;
    background-image:${bgImageStyle};
    background-size:cover; background-position:center;
    opacity:0.22;
    pointer-events:none;
  }

  .content-inner { position:relative; z-index:1; }
  .slide-tag {
    display:inline-block;
    background:${brand.secondaryColor};
    color:#fff; font-family:'Inter',sans-serif;
    font-size:18px; font-weight:700;
    padding:8px 24px; border-radius:30px;
    letter-spacing:1px;
    margin-bottom:36px;
    box-shadow:0 3px 12px ${brand.secondaryColor}50;
  }
  .main-title {
    font-weight:900; color:#1A1A1A;
    line-height:1.05; margin-bottom:28px;
  }
  .subtitle-text {
    font-family:'Inter',sans-serif;
    font-size:30px; color:#555; line-height:1.5;
    max-width:1050px; margin-bottom:32px;
    font-weight:400;
  }
  .topics {
    display:flex; flex-direction:column; gap:10px;
    margin-top:8px;
  }
  .topic-item {
    display:flex; align-items:center; gap:14px;
    font-family:'Inter',sans-serif;
    font-size:24px; color:#666; font-weight:500;
  }
  .topic-dot {
    width:8px; height:8px; border-radius:50%;
    flex-shrink:0;
  }

  .watermark {
    position:absolute; bottom:28px; right:36px;
    display:flex; align-items:center; gap:12px;
    opacity:0.38; z-index:10;
  }
  .watermark img { max-height:40px; object-fit:contain; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:15px; color:#1A1A1A; }
</style>
</head>
<body>

<!-- Left hero panel -->
<div class="hero-panel">
  <div class="hero-deco-lg"></div>
  <div class="hero-deco-sm"></div>
  <div class="hero-deco-dot"></div>
  <div class="institution-label">${escape(brand.institutionName)}</div>
  <div style="position:relative;z-index:1">
    <!-- Vertical dots -->
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:32px">
      <div style="width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.70)"></div>
      <div style="width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.40)"></div>
      <div style="width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.20)"></div>
    </div>
    <div class="course-badge">CURSO</div>
  </div>
</div>

<!-- Thin gradient divider -->
<div class="divider-line"></div>

<!-- Right content panel -->
<div class="content-panel">
  <div class="content-bg"></div>
  ${imageBase64 ? '<div class="img-texture"></div>' : ''}
  <div class="content-inner">
    <div class="slide-tag">MATERIAL EDUCATIVO</div>
    <div class="main-title" style="font-size:${titleSize}px">${escape(scene.title ?? '')}</div>
    ${subtitle ? `<div class="subtitle-text">${escape(subtitle)}</div>` : ''}
    ${bullets.length > 0
      ? `<div class="topics">
          ${bullets.map((b, i) =>
            `<div class="topic-item">
              <div class="topic-dot" style="background:${i === 0 ? brand.primaryColor : i === 1 ? brand.secondaryColor : brand.primaryColor + '80'}"></div>
              ${escape(b)}
            </div>`
          ).join('')}
        </div>`
      : ''}
  </div>
</div>

<!-- Watermark -->
${watermarkHtml(brand.logoBase64, brand.institutionName)}
</body>
</html>`;
}
