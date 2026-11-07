// Señales de tránsito de Colombia dibujadas en código: forma, colores y texto según el Manual de
// Señalización Vial (reglamentarias: círculo blanco con borde rojo, PARE octogonal, CEDA EL PASO
// triangular; preventivas: rombo amarillo con borde negro). Los símbolos son simplificados pero
// inequívocos. La IA solo puede elegir de esta lista: una señal nunca se inventa ni se genera.

export interface SignDef {
  /** Nombre que se muestra a la IA y a la revisión visual. */
  name: string;
  kind: 'reglamentaria' | 'preventiva';
  /** Admite un número (velocidad máxima). */
  value?: boolean;
}

export const SIGNS: Record<string, SignDef> = {
  pare: { name: 'PARE', kind: 'reglamentaria' },
  'ceda-el-paso': { name: 'CEDA EL PASO', kind: 'reglamentaria' },
  'velocidad-maxima': { name: 'Velocidad máxima (km/h)', kind: 'reglamentaria', value: true },
  'prohibido-girar-izquierda': { name: 'Prohibido girar a la izquierda', kind: 'reglamentaria' },
  'prohibido-girar-derecha': { name: 'Prohibido girar a la derecha', kind: 'reglamentaria' },
  'prohibido-girar-en-u': { name: 'Prohibido girar en U', kind: 'reglamentaria' },
  'prohibido-motos': { name: 'Prohibida la circulación de motocicletas', kind: 'reglamentaria' },
  'semaforo-adelante': { name: 'Semáforo adelante', kind: 'preventiva' },
  peatones: { name: 'Peatones en la vía', kind: 'preventiva' },
  'zona-escolar': { name: 'Zona escolar', kind: 'preventiva' },
  glorieta: { name: 'Glorieta adelante', kind: 'preventiva' },
  'curva-peligrosa': { name: 'Curva peligrosa', kind: 'preventiva' },
  resalto: { name: 'Resalto (reductor de velocidad)', kind: 'preventiva' },
  ciclistas: { name: 'Ciclistas en la vía', kind: 'preventiva' },
};

export const SIGN_IDS = Object.keys(SIGNS);

const RED = '#C8102E';
const YELLOW = '#FFCC00';
const INK = '#111111';

const svg = (inner: string): string =>
  `<svg viewBox="0 0 200 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

/** Señal reglamentaria redonda: fondo blanco, borde rojo y el símbolo en negro. */
function ring(symbol: string, slash = false): string {
  return svg(`<circle cx="100" cy="100" r="94" fill="#fff" stroke="#d0d0d0" stroke-width="2"/>
<circle cx="100" cy="100" r="84" fill="#fff" stroke="${RED}" stroke-width="20"/>${symbol}
${slash ? `<line x1="45" y1="155" x2="155" y2="45" stroke="${RED}" stroke-width="18" stroke-linecap="round"/>` : ''}`);
}

/** Señal preventiva: rombo amarillo con borde negro. */
function diamond(symbol: string): string {
  return svg(`<rect x="29" y="29" width="142" height="142" rx="12" transform="rotate(45 100 100)" fill="${YELLOW}" stroke="${INK}" stroke-width="7"/>
<rect x="37" y="37" width="126" height="126" rx="8" transform="rotate(45 100 100)" fill="none" stroke="${INK}" stroke-width="3"/>${symbol}`);
}

const PERSON = (x: number, y: number, s = 1): string => `<g transform="translate(${x} ${y}) scale(${s})" fill="${INK}" stroke="${INK}" stroke-linecap="round">
<circle cx="0" cy="-34" r="9" stroke="none"/>
<path d="M0 -24 L-3 6" stroke-width="10" fill="none"/>
<path d="M-3 6 L-16 32 M-3 6 L12 30" stroke-width="9" fill="none"/>
<path d="M-1 -18 L-17 -4 M-1 -18 L15 -8" stroke-width="7" fill="none"/></g>`;

export function signSvg(id: string, value?: number | null): string {
  switch (id) {
    case 'pare':
      return svg(`<polygon points="62,8 138,8 192,62 192,138 138,192 62,192 8,138 8,62" fill="${RED}" stroke="#fff" stroke-width="7"/>
<polygon points="66,18 134,18 182,66 182,134 134,182 66,182 18,134 18,66" fill="none" stroke="#fff" stroke-width="4"/>
<text x="100" y="117" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="46" letter-spacing="1" fill="#fff">PARE</text>`);
    case 'ceda-el-paso':
      return svg(`<polygon points="8,16 192,16 100,186" fill="#fff" stroke="${RED}" stroke-width="18" stroke-linejoin="round"/>
<text x="100" y="66" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="21" fill="${INK}">CEDA</text>
<text x="100" y="89" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="19" fill="${INK}">EL PASO</text>`);
    case 'velocidad-maxima': {
      const n = Number.isFinite(value) && value ? Math.round(value) : 30;
      return ring(`<text x="100" y="${n >= 100 ? 124 : 128}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="${n >= 100 ? 64 : 82}" fill="${INK}">${n}</text>`);
    }
    case 'prohibido-girar-izquierda':
      return ring(`<path d="M120 150 V95 Q120 75 100 75 H72" fill="none" stroke="${INK}" stroke-width="16"/><polygon points="50,75 78,52 78,98" fill="${INK}"/>`, true);
    case 'prohibido-girar-derecha':
      return ring(`<path d="M80 150 V95 Q80 75 100 75 H128" fill="none" stroke="${INK}" stroke-width="16"/><polygon points="150,75 122,52 122,98" fill="${INK}"/>`, true);
    case 'prohibido-girar-en-u':
      return ring(`<path d="M125 150 V85 A25 25 0 0 0 75 85 V120" fill="none" stroke="${INK}" stroke-width="16"/><polygon points="75,145 52,115 98,115" fill="${INK}"/>`, true);
    case 'prohibido-motos':
      // Moto de lado: ruedas, cuerpo con tanque y asiento, manubrio y conductor
      return ring(`<g fill="none" stroke="${INK}" stroke-width="8"><circle cx="62" cy="128" r="19"/><circle cx="140" cy="128" r="19"/></g>
<path d="M62 128 L84 100 H122 L140 128 Z" fill="${INK}"/><path d="M84 100 L78 90 H104 L112 100 Z" fill="${INK}"/>
<path d="M122 100 L132 78 M126 80 H142" stroke="${INK}" stroke-width="7" stroke-linecap="round" fill="none"/>
<circle cx="100" cy="60" r="10" fill="${INK}"/><path d="M98 70 L92 92 M98 74 L120 84" stroke="${INK}" stroke-width="9" stroke-linecap="round" fill="none"/>`, true);
    case 'semaforo-adelante':
      return diamond(`<rect x="80" y="50" width="40" height="100" rx="10" fill="${INK}"/>
<circle cx="100" cy="70" r="11" fill="#E53935"/><circle cx="100" cy="100" r="11" fill="#FFB300"/><circle cx="100" cy="130" r="11" fill="#43A047"/>`);
    case 'peatones':
      return diamond(PERSON(100, 108, 1.25));
    case 'zona-escolar':
      return diamond(`${PERSON(80, 112, 1.05)}${PERSON(122, 116, 0.9)}`);
    case 'glorieta':
      return diamond(`<g fill="none" stroke="${INK}" stroke-width="10">
<path d="M70 92 A32 32 0 0 1 118 70"/><path d="M128 84 A32 32 0 0 1 112 128"/><path d="M98 132 A32 32 0 0 1 68 104"/></g>
<g fill="${INK}"><polygon points="126,62 128,82 110,74"/><polygon points="104,138 116,122 120,140"/><polygon points="60,98 76,108 62,116"/></g>`);
    case 'curva-peligrosa':
      return diamond(`<path d="M88 150 V112 Q88 82 112 70 L112 70" fill="none" stroke="${INK}" stroke-width="16"/><polygon points="132,58 100,54 116,84" fill="${INK}"/>`);
    case 'resalto':
      return diamond(`<path d="M48 128 H70 Q100 72 130 128 H152" fill="none" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>`);
    case 'ciclistas':
      return diamond(`<g fill="none" stroke="${INK}" stroke-width="7"><circle cx="72" cy="126" r="17"/><circle cx="128" cy="126" r="17"/>
<path d="M72 126 L92 100 H118 L128 126 M92 100 L104 126 H128 M114 92 H124"/></g><circle cx="98" cy="78" r="8" fill="${INK}"/>
<path d="M98 86 L104 100" stroke="${INK}" stroke-width="8"/>`);
    default:
      return '';
  }
}
