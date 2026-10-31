import { BrandData } from '../slides.service';
import { GOOGLE_FONTS, escape, watermarkHtml } from './shared';
import { animationRuntime, SceneTimeline } from './animation';

// Base visual "editorial" de las plantillas nuevas (iconos y diagramas):
// título grande con etiqueta, fondo claro con manchas suaves de la marca,
// mucho aire y tipografía grande. Mismo lienzo 1920×1080 que el resto.

/** Color hex con transparencia (#RRGGBB + alpha 0–1). Devuelve el color tal cual si no es hex de 6 dígitos. */
export function alpha(hex: string, a: number): string {
  const c = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return hex;
  return `#${c}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;
}

export function editorialCSS(brand: BrandData): string {
  const p = brand.primaryColor;
  const s = brand.secondaryColor;
  return `* { margin:0; padding:0; box-sizing:border-box; }
body {
  width:1920px; height:1080px; overflow:hidden; position:relative;
  background:#F6F7F9; font-family:'Inter',sans-serif; color:#14161A;
  -webkit-font-smoothing:antialiased;
}
.bg-blob { position:absolute; border-radius:50%; filter:blur(10px); z-index:0; }
.bg-a { width:900px; height:900px; right:-260px; top:-380px; background:radial-gradient(circle, ${alpha(s, 0.16)} 0%, ${alpha(s, 0)} 70%); }
.bg-b { width:800px; height:800px; left:-300px; bottom:-420px; background:radial-gradient(circle, ${alpha(p, 0.12)} 0%, ${alpha(p, 0)} 70%); }
.bg-dots { position:absolute; inset:0; z-index:0; opacity:0.5;
  background-image:radial-gradient(${alpha(p, 0.10)} 1.5px, transparent 1.5px); background-size:36px 36px; }
.header { position:relative; z-index:2; padding:64px 110px 0 110px; display:flex; flex-direction:column; gap:14px; }
.eyebrow { display:flex; align-items:center; gap:14px; font-family:'Inter',sans-serif; font-weight:700;
  font-size:22px; letter-spacing:3px; text-transform:uppercase; color:${s}; }
.eyebrow::before { content:''; width:44px; height:5px; border-radius:3px; background:${s}; }
.scene-title { font-family:'Nunito',sans-serif; font-weight:900; color:${p}; line-height:1.05; letter-spacing:-0.5px; }
.stage { position:absolute; z-index:1; left:0; right:0; top:230px; bottom:84px; }
.footer { position:absolute; z-index:2; left:110px; right:110px; bottom:28px; display:flex; justify-content:flex-end; }
.watermark { display:flex; align-items:center; gap:10px; opacity:0.85; }
.watermark img { max-height:48px; object-fit:contain; }
.watermark-name { font-size:16px; font-weight:600; color:#7A808A; }`;
}

function titleSize(title: string): number {
  const n = title.length;
  if (n <= 28) return 68;
  if (n <= 42) return 58;
  if (n <= 60) return 48;
  return 40;
}

export function editorialPage(opts: {
  brand: BrandData;
  eyebrow: string;
  title: string;
  css: string;
  body: string;
  timeline?: SceneTimeline | null;
  /** 'dark': fondo con degradado de la marca y texto blanco (cierre). */
  variant?: 'light' | 'dark';
}): string {
  const { brand, eyebrow, title, css, body, timeline, variant } = opts;
  const dark = variant === 'dark'
    ? `body { background:linear-gradient(135deg, ${brand.primaryColor} 0%, ${brand.primaryColor} 45%, ${brand.secondaryColor} 140%); color:#fff; }
.bg-dots { background-image:radial-gradient(rgba(255,255,255,0.10) 1.5px, transparent 1.5px); }
.bg-a { background:radial-gradient(circle, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 70%); }
.bg-b { background:radial-gradient(circle, ${alpha(brand.secondaryColor, 0.35)} 0%, ${alpha(brand.secondaryColor, 0)} 70%); }
.eyebrow { color:#fff; opacity:0.85; } .eyebrow::before { background:#fff; }
.scene-title { color:#fff; } .watermark-name { color:rgba(255,255,255,0.8); }`
    : '';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="${GOOGLE_FONTS}" rel="stylesheet">
<style>
${editorialCSS(brand)}
${dark}
${css}
</style>
</head>
<body>
<div class="bg-dots"></div>
<div class="bg-blob bg-a"></div>
<div class="bg-blob bg-b"></div>
<div class="header">
  <div class="eyebrow">${escape(eyebrow)}</div>
  <div class="scene-title" style="font-size:${titleSize(title)}px">${escape(title)}</div>
</div>
<div class="stage">
${body}
</div>
<div class="footer">${watermarkHtml(brand.logoBase64, brand.institutionName)}</div>
${animationRuntime(timeline)}
</body>
</html>`;
}
