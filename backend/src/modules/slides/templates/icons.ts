import * as fs from 'fs';
import * as path from 'path';

// Iconos Lucide (lucide-static, licencia ISC) para las plantillas.
// El guion elige un icono por elemento de esta lista cerrada; así el LLM no inventa
// nombres y todos los iconos tienen el mismo trazo.

export const ICON_NAMES = [
  // Ideas y aprendizaje
  'lightbulb', 'brain', 'book-open', 'graduation-cap', 'notebook-pen', 'puzzle', 'sparkles', 'search',
  'eye', 'message-circle', 'messages-square', 'circle-help', 'quote', 'pencil', 'library', 'school',
  // Personas y sociedad
  'user', 'users', 'baby', 'hand-heart', 'handshake', 'smile', 'frown', 'heart', 'house', 'building-2',
  'landmark', 'globe', 'map', 'flag', 'vote', 'scale',
  // Proceso y acción
  'target', 'rocket', 'footprints', 'repeat', 'refresh-cw', 'arrow-right-left', 'list-checks', 'circle-check',
  'circle-x', 'triangle-alert', 'shield-check', 'lock', 'key', 'settings', 'wrench', 'hammer', 'route',
  'compass', 'milestone', 'play', 'pause', 'timer', 'clock', 'calendar', 'hourglass', 'bell', 'zap',
  // Datos y negocio
  'trending-up', 'trending-down', 'chart-bar', 'chart-pie', 'chart-line', 'calculator', 'percent', 'coins',
  'wallet', 'piggy-bank', 'banknote', 'shopping-cart', 'store', 'briefcase', 'factory', 'truck', 'package',
  'gift', 'trophy', 'medal', 'star', 'award',
  // Ciencia y salud
  'flask-conical', 'microscope', 'atom', 'dna', 'test-tube', 'heart-pulse', 'stethoscope', 'pill',
  'activity', 'apple', 'dumbbell', 'bed', 'moon', 'sun', 'leaf', 'sprout', 'tree-pine', 'droplets', 'flame',
  'wind', 'cloud-rain', 'mountain', 'waves', 'recycle', 'earth',
  // Tecnología y comunicación
  'cpu', 'monitor', 'smartphone', 'wifi', 'database', 'code', 'bot', 'network', 'share-2', 'mail',
  'megaphone', 'camera', 'music', 'palette', 'layers', 'layout-grid', 'link', 'file-text', 'clipboard-list',
] as const;

const ICON_DIR = path.join(path.dirname(require.resolve('lucide-static/package.json')), 'icons');
const cache = new Map<string, string>();

export function isValidIcon(name: unknown): name is string {
  return typeof name === 'string' && (ICON_NAMES as readonly string[]).includes(name);
}

/** SVG inline del icono, o '' si no existe. */
export function iconSvg(name: string | null | undefined, size: number, color: string, strokeWidth = 2): string {
  if (!name || !isValidIcon(name)) return '';
  let raw = cache.get(name);
  if (raw === undefined) {
    try {
      raw = fs.readFileSync(path.join(ICON_DIR, `${name}.svg`), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();
    } catch {
      raw = '';
    }
    cache.set(name, raw);
  }
  if (!raw) return '';
  return raw
    .replace(/class="[^"]*"/, '')
    .replace(/width="24"/, `width="${size}"`)
    .replace(/height="24"/, `height="${size}"`)
    .replace(/stroke="currentColor"/, `stroke="${color}"`)
    .replace(/stroke-width="2"/, `stroke-width="${strokeWidth}"`);
}
