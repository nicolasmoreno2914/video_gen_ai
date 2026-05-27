import { VideoTheme, backgroundCSS, backgroundSize, radiusValue, headerCSS, headerTitleColor, bulletMarker } from '../theme';

export const GOOGLE_FONTS =
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;900&family=Inter:wght@400;500;600&display=swap';

export function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlighted(text: string, highlights: string[], _accentColor: string): string {
  let out = escape(text);
  for (const word of highlights) {
    const re = new RegExp(`(${escapeRe(word)})`, 'gi');
    out = out.replace(re, `<mark style="background:#FFE500;padding:2px 8px;border-radius:4px;">$1</mark>`);
  }
  return out;
}

export function bgStyle(theme: VideoTheme): string {
  const css = backgroundCSS(theme);
  const size = backgroundSize(theme);
  if (!css || css === 'none') return '';
  return `background-image: ${css}; ${size ? `background-size: ${size};` : ''}`;
}

// ─── Typography helpers ───────────────────────────────────────────────────────

export function isKeyword(text: string): boolean {
  return text.split(/\s+/).filter(w => w.length > 0).length <= 4;
}

/** Dynamic font size for bullet lists based on item count and max text length. */
export function bulletFontSize(texts: string[], max = 40, min = 24): number {
  if (texts.length === 0) return max;
  const count = texts.length;
  const maxLen = Math.max(...texts.map(t => t.length));
  const allKeywords = texts.every(t => isKeyword(t));

  let size = allKeywords ? max + 6 : max;
  if (count >= 5) size -= 10;
  else if (count === 4) size -= 6;
  else if (count === 3) size -= 2;

  if (!allKeywords) {
    if (maxLen > 110) size -= 8;
    else if (maxLen > 80) size -= 5;
    else if (maxLen > 55) size -= 2;
  }

  return Math.max(min, Math.min(max + 6, size));
}

/** Dynamic font size for heading text based on character length. */
export function adaptiveTitleSize(title: string, max: number, min: number): number {
  const len = title.length;
  if (len <= 35) return max;
  if (len <= 55) return Math.round(max * 0.88);
  if (len <= 75) return Math.round(max * 0.76);
  if (len <= 95) return Math.round(max * 0.66);
  return Math.max(min, Math.round(max * 0.58));
}

/** Linear color interpolation between two hex colors (t = 0..1). Falls back to color1 on parse error. */
export function lerpColor(hex1: string, hex2: string, t: number): string {
  const parse = (h: string): [number, number, number] | null => {
    const c = h.replace('#', '');
    if (c.length !== 6) return null;
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return isNaN(r + g + b) ? null : [r, g, b];
  };
  const c1 = parse(hex1);
  const c2 = parse(hex2);
  if (!c1 || !c2) return hex1;
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgb(${r},${g},${b})`;
}

// ─── HTML building blocks ─────────────────────────────────────────────────────

export function watermarkHtml(logoUrl: string | null, institutionName: string, dark = false): string {
  return `<div class="watermark">
    ${logoUrl ? `<img src="${logoUrl}" alt="logo">` : ''}
    <span class="watermark-name" style="color:${dark ? '#fff' : '#1A1A1A'}">${escape(institutionName)}</span>
  </div>`;
}

export function footerHtml(logoUrl: string | null, institutionName: string): string {
  return `<div class="footer">
    ${watermarkHtml(logoUrl, institutionName)}
  </div>`;
}

export function headerHtml(
  theme: VideoTheme,
  primaryColor: string,
  secondaryColor: string,
  title: string,
  badge?: string,
): string {
  const titleColor = headerTitleColor(theme);
  const hStyle = headerCSS(theme, primaryColor);
  const fontSize = adaptiveTitleSize(title, 42, 26);
  const badgeHtml = badge
    ? `<div style="background:${secondaryColor};color:#fff;font-family:'Inter',sans-serif;font-size:20px;font-weight:600;padding:8px 24px;border-radius:30px;white-space:nowrap;flex-shrink:0">${escape(badge)}</div>`
    : '';
  return `<div class="header" style="${hStyle}">
    <div class="scene-title" style="color:${titleColor};font-size:${fontSize}px">${escape(title)}</div>
    ${badgeHtml}
  </div>`;
}

/**
 * Builds bullet HTML with dynamic font size and keyword vs phrase differentiation.
 * Keywords (≤4 words): bold, larger.
 * Phrases (>4 words): regular weight, size scaled by count and length.
 */
export function buildBullets(
  texts: string[],
  theme: VideoTheme,
  secondaryColor: string,
  highlights: string[] = [],
): string {
  if (texts.length === 0) return '';
  const allKeywords = texts.every(t => isKeyword(t));
  const fontSize = bulletFontSize(texts);
  const lineHeight = allKeywords ? 1.2 : 1.45;
  const gap = allKeywords ? 20 : 28;

  return texts.map((b, i) => {
    const kw = isKeyword(b);
    const weight = (allKeywords || kw) ? '700' : '400';
    return `<div class="bullet-row" style="display:flex;align-items:flex-start;gap:18px;margin-bottom:${gap}px">
      ${bulletMarker(theme, i, secondaryColor)}
      <span style="font-family:'Inter',sans-serif;font-size:${fontSize}px;font-weight:${weight};line-height:${lineHeight};color:#1A1A1A">${highlighted(b, highlights, secondaryColor)}</span>
    </div>`;
  }).join('');
}

export { radiusValue, headerTitleColor };
