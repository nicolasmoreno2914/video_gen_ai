import * as fs from 'fs';
import * as path from 'path';

// Piezas de las escenas animadas: ilustraciones planas (Microsoft Fluent Emoji, MIT, en
// backend/assets/illustrations) e íconos de línea (Lucide, ISC). El guion de animación las pide
// por nombre en inglés; si el nombre no existe se busca por palabras clave, y si tampoco hay
// coincidencia se devuelven sugerencias para que la IA corrija.

export type AssetKind = 'illustration' | 'icon';

export interface AssetMatch {
  kind: AssetKind;
  name: string;
}

interface CatalogEntry {
  group: string;
  keywords: string[];
}

const ILLUSTRATION_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'assets', 'illustrations');
const ICON_DIR = path.join(path.dirname(require.resolve('lucide-static/package.json')), 'icons');

let illustrations: Record<string, CatalogEntry> | null = null;
let icons: Record<string, string[]> | null = null;
const svgCache = new Map<string, string>();

function illustrationCatalog(): Record<string, CatalogEntry> {
  illustrations ??= JSON.parse(fs.readFileSync(path.join(ILLUSTRATION_DIR, 'catalog.json'), 'utf8')) as Record<string, CatalogEntry>;
  return illustrations;
}

function iconCatalog(): Record<string, string[]> {
  icons ??= JSON.parse(
    fs.readFileSync(path.join(path.dirname(require.resolve('lucide-static/package.json')), 'tags.json'), 'utf8'),
  ) as Record<string, string[]>;
  return icons;
}

export const slug = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Colores y adjetivos no ayudan a elegir el dibujo ("red car" busca "car")
const FILLER = new Set(['red', 'blue', 'green', 'yellow', 'white', 'black', 'gray', 'grey', 'orange', 'big', 'small',
  'little', 'large', 'old', 'new', 'young', 'the', 'and', 'of', 'with', 'icon', 'illustration', 'image', 'cartoon']);

function words(s: string): string[] {
  const all = slug(s).split('-').filter((w) => w.length > 1);
  const kept = all.filter((w) => !FILLER.has(w));
  return kept.length ? kept : all;
}

/** Puntaje de coincidencia entre lo pedido y una pieza (nombre y palabras clave). */
function score(query: string[], name: string, keywords: string[]): number {
  const nameWords = name.split('-');
  // La frase completa es una palabra clave ("car" → automobile, "pedestrian" → person-walking)
  let total = keywords.includes(query.join(' ')) ? 3 : 0;
  for (const q of query) {
    if (nameWords.includes(q)) total += 3;
    else if (keywords.some((k) => k.split(/\s+/).includes(q))) total += 2;
  }
  // A igual puntaje, el nombre más corto es el más genérico ("car" antes que "car-front-wheel")
  // Palabras del nombre que no se pidieron restan: "car" → automobile antes que police-car
  return total - nameWords.filter((n) => !query.includes(n)).length * 0.5;
}

function best(query: string[], entries: Array<[string, string[]]>, limit: number): Array<[string, number]> {
  return entries
    .map(([name, kw]) => [name, score(query, name, kw)] as [string, number])
    .filter(([, s]) => s > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

/** Mínimo para aceptar una pieza parecida: cada palabra pedida debe coincidir con el nombre o una palabra clave. */
const minScore = (query: string[]): number => Math.max(1.4, query.length * 2 - 0.5);

/** Conceptos comunes cuyo mejor dibujo no se encuentra por palabras clave. */
const ILLUSTRATION_ALIASES: Record<string, string> = {
  car: 'automobile', doctor: 'health-worker', nurse: 'health-worker',
  pedestrian: 'person-walking', computer: 'laptop', 'traffic-light': 'vertical-traffic-light',
  contract: 'page-facing-up', document: 'page-facing-up', clock: 'mantelpiece-clock', tree: 'deciduous-tree', 'sports-car': 'racing-car',
};

/** Pieza exacta o la más parecida; null si nada se parece lo suficiente. */
export function findAsset(kind: AssetKind, requested: string): AssetMatch | null {
  // Sin colores ni adjetivos: "red car" se busca como "car"
  const asked = words(requested).join('-');
  const name = kind === 'illustration' ? ILLUSTRATION_ALIASES[asked] ?? asked : asked;
  if (!name) return null;
  if (kind === 'illustration') {
    const cat = illustrationCatalog();
    if (cat[name]) return { kind, name };
    const query = words(requested);
    const [top] = best(query, Object.entries(cat).map(([n, e]) => [n, e.keywords]), 1);
    return top && top[1] >= minScore(query) ? { kind, name: top[0] } : null;
  }
  const cat = iconCatalog();
  if (cat[name]) return { kind, name };
  const query = words(requested);
  const [top] = best(query, Object.entries(cat), 1);
  return top && top[1] >= minScore(query) ? { kind, name: top[0] } : null;
}

/** Nombres parecidos para el mensaje de error que se devuelve a la IA. */
export function suggestAssets(kind: AssetKind, requested: string, limit = 6): string[] {
  const query = words(requested);
  const entries: Array<[string, string[]]> = kind === 'illustration'
    ? Object.entries(illustrationCatalog()).map(([n, e]) => [n, e.keywords])
    : Object.entries(iconCatalog());
  return best(query, entries, limit).map(([n]) => n);
}

// Estilo 3D (Fluent Emoji 3D, PNG 256 px, misma licencia y mismos nombres): con MOTION_ILLUSTRATION_STYLE=3d
// las ilustraciones salen de MOTION_3D_DIR (o assets/illustrations-3d). Si falta el PNG, se usa el plano.
const illustration3dDir = (): string => process.env.MOTION_3D_DIR ?? path.resolve(ILLUSTRATION_DIR, '..', 'illustrations-3d');
const pngCache = new Map<string, string>();

function illustration3d(name: string): string {
  if (process.env.MOTION_ILLUSTRATION_STYLE !== '3d') return '';
  let uri = pngCache.get(name);
  if (uri === undefined) {
    try {
      uri = `data:image/png;base64,${fs.readFileSync(path.join(illustration3dDir(), `${name}.png`)).toString('base64')}`;
    } catch {
      uri = '';
    }
    pngCache.set(name, uri);
  }
  return uri ? `<img src="${uri}" alt="" width="100%" height="100%">` : '';
}

/** SVG de la pieza (sin tamaño fijo: se ajusta a su caja). Los íconos usan el color dado. */
export function assetSvg(asset: AssetMatch, color = '#14161A', strokeWidth = 2): string {
  if (asset.kind === 'illustration') {
    const img = illustration3d(asset.name);
    if (img) return img;
  }
  const key = `${asset.kind}:${asset.name}`;
  let raw = svgCache.get(key);
  if (raw === undefined) {
    const file = asset.kind === 'illustration'
      ? path.join(ILLUSTRATION_DIR, 'svg', `${asset.name}.svg`)
      : path.join(ICON_DIR, `${asset.name}.svg`);
    try {
      raw = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();
    } catch {
      raw = '';
    }
    svgCache.set(key, raw);
  }
  if (!raw) return '';
  const sized = raw.replace(/\swidth="[^"]*"/, ' width="100%"').replace(/\sheight="[^"]*"/, ' height="100%"');
  if (asset.kind === 'illustration') return sized;
  return sized
    .replace(/class="[^"]*"/, '')
    .replace(/stroke="currentColor"/, `stroke="${color}"`)
    .replace(/stroke-width="2"/, `stroke-width="${strokeWidth}"`);
}

/** Todas las ilustraciones por grupo: la IA elige de aquí el nombre exacto (≈ 7.000 tokens). */
export function illustrationCatalogText(): string {
  return illustrationSamples(Infinity);
}

/** Lista corta de ilustraciones por grupo, para orientar a la IA en el prompt. */
export function illustrationSamples(perGroup = 40): string {
  const byGroup = new Map<string, string[]>();
  for (const [name, e] of Object.entries(illustrationCatalog())) {
    const list = byGroup.get(e.group) ?? [];
    if (list.length < perGroup) list.push(name);
    byGroup.set(e.group, list);
  }
  return [...byGroup.entries()].map(([g, names]) => `${g}: ${names.join(', ')}`).join('\n');
}
