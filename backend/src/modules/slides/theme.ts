export interface VideoTheme {
  background: 'grid' | 'dots' | 'clean';
  headerStyle: 'full-bar' | 'left-accent' | 'top-line';
  bulletStyle: 'dot' | 'numbered' | 'arrow';
  imagePosition: 'right' | 'left';
  cardRadius: 'sharp' | 'medium' | 'soft';
}

function cyrb53(str: string): number {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) * 0x100000000 + (h1 >>> 0);
}

export function getVideoTheme(jobId: string): VideoTheme {
  const h = cyrb53(jobId);
  const b = [
    (h >>> 0) & 0xff,
    (h >>> 8) & 0xff,
    (h >>> 16) & 0xff,
    (h >>> 24) & 0xff,
    (h / 0x100000000) & 0xff,
  ];
  return {
    background:   (['grid', 'dots', 'clean'] as const)[b[0] % 3],
    headerStyle:  (['full-bar', 'left-accent', 'top-line'] as const)[b[1] % 3],
    bulletStyle:  (['dot', 'numbered', 'arrow'] as const)[b[2] % 3],
    imagePosition: (['right', 'left'] as const)[b[3] % 2],
    cardRadius:   (['sharp', 'medium', 'soft'] as const)[b[4] % 3],
  };
}

export function backgroundCSS(theme: VideoTheme): string {
  switch (theme.background) {
    case 'dots':
      return `radial-gradient(circle, #d0d0d0 1.5px, transparent 1.5px) 0 0 / 32px 32px`;
    case 'clean':
      return 'none';
    default: // grid
      return `linear-gradient(#ebebeb 1px, transparent 1px), linear-gradient(90deg, #ebebeb 1px, transparent 1px)`;
  }
}

export function backgroundSize(theme: VideoTheme): string {
  if (theme.background === 'grid') return '40px 40px';
  return '';
}

export function radiusValue(theme: VideoTheme): string {
  switch (theme.cardRadius) {
    case 'sharp': return '6px';
    case 'soft':  return '24px';
    default:      return '14px';
  }
}

export function headerCSS(theme: VideoTheme, primaryColor: string): string {
  switch (theme.headerStyle) {
    case 'left-accent':
      return `border-left: 14px solid ${primaryColor}; background: #fff;`;
    case 'top-line':
      return `border-top: 6px solid ${primaryColor}; background: #fff;`;
    default: // full-bar
      return `background: ${primaryColor};`;
  }
}

export function headerTitleColor(theme: VideoTheme): string {
  return theme.headerStyle === 'full-bar' ? '#fff' : '#1A1A1A';
}

export function bulletMarker(theme: VideoTheme, index: number, secondaryColor: string): string {
  switch (theme.bulletStyle) {
    case 'numbered':
      return `<span style="color:${secondaryColor};font-family:'Nunito',sans-serif;font-weight:900;font-size:32px;min-width:52px;text-align:right;flex-shrink:0">${String(index + 1).padStart(2, '0')}.</span>`;
    case 'arrow':
      return `<span style="color:${secondaryColor};font-size:28px;min-width:36px;flex-shrink:0;line-height:1.5">→</span>`;
    default: // dot
      return `<span style="display:inline-block;width:12px;height:12px;background:${secondaryColor};border-radius:50%;flex-shrink:0;margin-top:12px"></span>`;
  }
}
