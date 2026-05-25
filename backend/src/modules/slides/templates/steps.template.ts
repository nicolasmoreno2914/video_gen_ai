import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, footerHtml, headerHtml, radiusValue, lerpColor } from './shared';

function stepFontSize(count: number, maxLen: number): number {
  const base = count <= 2 ? 34 : count === 3 ? 30 : count === 4 ? 26 : 23;
  const reduction = maxLen > 90 ? 4 : maxLen > 65 ? 2 : 0;
  return Math.max(18, base - reduction);
}

const ARROW_SVG = (color: string) =>
  `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 20H32M32 20L22 10M32 20L22 30" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

function buildHorizontalSteps(
  steps: string[],
  primary: string,
  secondary: string,
  radius: string,
): string {
  const count = steps.length;
  const maxLen = Math.max(...steps.map(s => s.length));
  const fontSize = stepFontSize(count, maxLen);
  // Fade arrow color based on midpoint
  const arrowColor = lerpColor(primary, secondary, 0.5);

  const stepCards = steps.map((step, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const topColor = lerpColor(primary, secondary, t);
    const numBg = `rgba(255,255,255,0.22)`;
    const isLast = i === count - 1;

    return `
      <div style="flex:1;display:flex;flex-direction:column;align-items:stretch;min-width:0">
        <!-- Card -->
        <div style="
          background:white;
          border-radius:${radius};
          box-shadow:0 4px 24px rgba(0,0,0,0.10);
          overflow:hidden;
          display:flex;
          flex-direction:column;
          height:100%;
        ">
          <!-- Colored header with step number -->
          <div style="
            background:${topColor};
            padding:22px 24px 18px;
            display:flex;
            align-items:center;
            gap:16px;
          ">
            <div style="
              width:56px; height:56px; min-width:56px;
              border-radius:50%;
              background:${numBg};
              border:2.5px solid rgba(255,255,255,0.55);
              display:flex; align-items:center; justify-content:center;
              color:#fff; font-family:'Nunito',sans-serif;
              font-size:28px; font-weight:900;
            ">${i + 1}</div>
            <div style="
              height:3px; flex:1;
              background:rgba(255,255,255,0.30);
              border-radius:2px;
            "></div>
          </div>
          <!-- Step text -->
          <div style="
            flex:1; padding:28px 28px;
            display:flex; align-items:center; justify-content:center;
          ">
            <p style="
              font-family:'Inter',sans-serif;
              font-size:${fontSize}px;
              font-weight:500;
              color:#1A1A1A;
              text-align:center;
              line-height:1.45;
              margin:0;
            ">${escape(step)}</p>
          </div>
          <!-- Bottom accent strip -->
          <div style="height:5px;background:${topColor};opacity:0.35"></div>
        </div>
      </div>
      ${!isLast ? `
        <!-- Arrow connector -->
        <div style="
          width:52px; min-width:52px;
          display:flex; align-items:center; justify-content:center;
          padding-top:30px;
        ">
          ${ARROW_SVG(arrowColor)}
        </div>
      ` : ''}
    `;
  }).join('');

  return `<div style="
    display:flex;
    align-items:stretch;
    gap:0;
    padding:0 80px;
    width:100%;
    height:100%;
  ">${stepCards}</div>`;
}

function buildVerticalSteps(steps: string[], primary: string, secondary: string, radius: string): string {
  const maxLen = Math.max(...steps.map(s => s.length));
  const fontSize = Math.max(20, 28 - (maxLen > 90 ? 5 : maxLen > 65 ? 3 : 0));
  const gap = steps.length >= 5 ? 14 : 20;

  return steps.map((step, i) => {
    const t = steps.length === 1 ? 0.5 : i / (steps.length - 1);
    const dotColor = lerpColor(primary, secondary, t);
    const isLast = i === steps.length - 1;

    return `
      <div style="display:flex;align-items:stretch;gap:0;margin-bottom:${isLast ? 0 : gap}px">
        <!-- Number + line column -->
        <div style="
          display:flex; flex-direction:column; align-items:center;
          width:80px; min-width:80px; flex-shrink:0;
        ">
          <div style="
            width:56px; height:56px;
            border-radius:50%;
            background:${dotColor};
            color:#fff; font-family:'Nunito',sans-serif;
            font-size:24px; font-weight:900;
            display:flex; align-items:center; justify-content:center;
            box-shadow:0 3px 14px ${dotColor}60;
            z-index:1; position:relative; flex-shrink:0;
          ">${String(i + 1).padStart(2, '0')}</div>
          ${!isLast ? `
            <div style="
              width:3px; flex:1; min-height:${gap}px;
              background:linear-gradient(to bottom,${dotColor}70,transparent);
              margin-top:4px;
            "></div>
          ` : ''}
        </div>
        <!-- Card -->
        <div style="
          flex:1;
          background:white;
          border-radius:${radius};
          border-left:5px solid ${dotColor};
          box-shadow:0 2px 16px rgba(0,0,0,0.08);
          padding:16px 36px 16px 24px;
          display:flex; align-items:center;
          margin-left:16px;
        ">
          <p style="
            font-family:'Inter',sans-serif;
            font-size:${fontSize}px;
            font-weight:500; color:#1A1A1A;
            line-height:1.45; margin:0;
          ">${escape(step)}</p>
        </div>
      </div>
    `;
  }).join('');
}

export function buildStepsTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand } = data;
  const steps = (scene.on_screen_text ?? []).slice(0, 6);
  const radius = radiusValue(theme);
  const useVertical = steps.length >= 5;

  const stepsContent = useVertical
    ? buildVerticalSteps(steps, brand.primaryColor, brand.secondaryColor, radius)
    : buildHorizontalSteps(steps, brand.primaryColor, brand.secondaryColor, radius);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; overflow:hidden; background:#f5f7fa; font-family:'Nunito',sans-serif; display:flex; flex-direction:column; }
  .grid-bg { position:fixed; inset:0; ${bgStyle(theme)} opacity:0.45; z-index:0; }
  .body {
    flex:1; display:flex; align-items:center; justify-content:center;
    position:relative; z-index:1;
    ${useVertical ? 'padding:28px 120px;' : 'padding:32px 0;'}
  }
  .v-container { width:100%; display:flex; flex-direction:column; justify-content:center; }
  .footer { height:88px; border-top:1px solid #e5e8ec; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; background:white; }
  .watermark { display:flex; align-items:center; gap:10px; opacity:0.45; }
  .watermark img { max-height:36px; }
  .watermark-name { font-family:'Inter',sans-serif; font-size:16px; }
</style>
</head>
<body>
<div class="grid-bg"></div>
${headerHtml(theme, brand.primaryColor, brand.secondaryColor, scene.title ?? '', 'PASOS')}
<div class="body">
  ${useVertical
    ? `<div class="v-container">${stepsContent}</div>`
    : stepsContent}
</div>
${footerHtml(brand.logoUrl, brand.institutionName)}
</body>
</html>`;
}
