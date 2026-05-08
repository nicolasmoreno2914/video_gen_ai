import { SlideTemplateData } from '../slides.service';
import { VideoTheme } from '../theme';
import { GOOGLE_FONTS, escape, bgStyle, footerHtml, headerHtml, radiusValue, adaptiveTitleSize, lerpColor } from './shared';

function stepFontSize(count: number, maxLen: number): number {
  const base = count <= 2 ? 36 : count === 3 ? 30 : count === 4 ? 26 : 24;
  const reduction = maxLen > 80 ? 4 : maxLen > 55 ? 2 : 0;
  return Math.max(20, base - reduction);
}

function buildHorizontalSteps(steps: string[], primary: string, secondary: string, radius: string): string {
  const count = steps.length;
  // Connector line: from center of first circle to center of last circle
  // Each step occupies 1760/count px. Circle is 88px wide, centered in step.
  const stepW = Math.floor(1760 / count);
  const lineLeft = 80 + stepW / 2;
  const lineRight = 80 + stepW / 2;
  const maxLen = Math.max(...steps.map(s => s.length));
  const fontSize = stepFontSize(count, maxLen);

  const stepHtml = steps.map((step, i) => {
    const t = count === 1 ? 1 : i / (count - 1);
    const circleColor = lerpColor(primary, secondary, t);
    return `<div class="h-step">
      <div class="h-circle" style="background:${circleColor}">${i + 1}</div>
      <div class="h-text" style="font-size:${fontSize}px">${escape(step)}</div>
    </div>`;
  }).join('');

  return `<div class="h-pipeline" style="position:relative;width:100%;display:flex;align-items:flex-start;padding:0 80px;gap:0">
    <div style="position:absolute;top:44px;left:${lineLeft}px;right:${lineRight}px;height:4px;background:linear-gradient(to right,${primary},${secondary});border-radius:2px;z-index:0"></div>
    ${stepHtml}
  </div>`;
}

function buildVerticalSteps(steps: string[], primary: string, secondary: string): string {
  const maxLen = Math.max(...steps.map(s => s.length));
  const fontSize = Math.max(24, 32 - (maxLen > 80 ? 6 : maxLen > 55 ? 3 : 0));

  return steps.map((step, i) => {
    const t = (steps.length === 1) ? 1 : i / (steps.length - 1);
    const dotColor = lerpColor(primary, secondary, t);
    const isLast = i === steps.length - 1;
    return `<div style="display:flex;align-items:flex-start;gap:0;position:relative">
      <div style="display:flex;flex-direction:column;align-items:center;width:80px;flex-shrink:0">
        <div style="width:56px;height:56px;border-radius:50%;background:${dotColor};color:#fff;font-family:'Nunito',sans-serif;font-size:24px;font-weight:900;display:flex;align-items:center;justify-content:center;z-index:1;position:relative">
          ${String(i + 1).padStart(2, '0')}
        </div>
        ${!isLast ? `<div style="width:3px;flex:1;min-height:20px;background:linear-gradient(to bottom,${dotColor}80,transparent);margin-top:4px"></div>` : ''}
      </div>
      <div style="flex:1;padding:${isLast ? '8px 80px 0 20px' : '8px 80px 32px 20px'}">
        <div style="font-family:'Inter',sans-serif;font-size:${fontSize}px;font-weight:500;color:#1A1A1A;line-height:1.4">${escape(step)}</div>
      </div>
    </div>`;
  }).join('');
}

export function buildStepsTemplate(data: SlideTemplateData, theme: VideoTheme): string {
  const { scene, brand } = data;
  const steps = (scene.on_screen_text ?? []).slice(0, 5);
  const radius = radiusValue(theme);
  const useVertical = steps.length >= 5;

  const stepsContent = useVertical
    ? buildVerticalSteps(steps, brand.primaryColor, brand.secondaryColor)
    : buildHorizontalSteps(steps, brand.primaryColor, brand.secondaryColor, radius);

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
  .body { flex:1; display:flex; align-items:center; justify-content:center; position:relative; z-index:1;
    ${useVertical ? 'padding:32px 100px;' : 'padding:40px 0;'} }
  .v-container { width:100%; display:flex; flex-direction:column; justify-content:center; gap:0; }
  /* horizontal step */
  .h-step { flex:1; display:flex; flex-direction:column; align-items:center; gap:24px; position:relative; z-index:1; padding:0 16px; }
  .h-circle { width:88px; height:88px; border-radius:50%; color:#fff; font-family:'Nunito',sans-serif; font-size:40px; font-weight:900; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(0,0,0,0.18); flex-shrink:0; }
  .h-text { font-family:'Inter',sans-serif; font-weight:500; color:#1A1A1A; text-align:center; line-height:1.4; max-width:380px; }
  .footer { height:100px; border-top:2px solid #f0f0f0; display:flex; align-items:center; justify-content:flex-end; padding:0 36px; position:relative; z-index:1; }
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
