// Utilidades comunes de las plantillas.

export const GOOGLE_FONTS =
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;900&family=Inter:wght@400;500;600;700;800&display=swap';

export function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlighted(text: string, highlights: string[], _accentColor: string): string {
  let out = escape(text);
  for (const word of highlights) {
    // Solo palabras completas: "automatiza" no debe resaltarse dentro de "automatización"
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${escapeRe(word)})(?![\\p{L}\\p{N}])`, 'giu');
    out = out.replace(re, `<mark>$1</mark>`);
  }
  return out;
}


export function watermarkHtml(logoBase64: string | null, institutionName: string, dark = false): string {
  return `<div class="watermark">
    ${logoBase64
      ? `<img src="${logoBase64}" alt="logo">`
      : `<span class="watermark-name" style="color:${dark ? '#fff' : '#1A1A1A'}">${escape(institutionName)}</span>`
    }
  </div>`;
}
