import { createHash } from 'crypto';
import { StorageService } from '../storage/storage.service';

// Marca por pedido para la API externa: una integración (p. ej. Cursia) atiende a muchos clientes
// con una sola clave de API, así que el logo y el nombre de cada video vienen en el pedido. Sin
// ellos, el video usa la marca de la cuenta de Videogen como siempre.

/** Tamaño máximo del logo ya decodificado (Cursia acepta hasta 4,5 MB). */
export const MAX_REQUEST_LOGO_BYTES = 5 * 1024 * 1024;

export interface RequestBrandInput {
  logo_data_uri?: string;
  institution_name?: string;
}

export interface ResolvedRequestBrand {
  /** Para videosService.create: solo lo que vino en el pedido; el resto sale de la cuenta. */
  brand?: { logo_url?: string; institution_name?: string };
  warnings: string[];
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG o JPEG en data URI base64, con bytes que coinciden con el tipo declarado. */
export function parseLogoDataUri(value: string): { ok: true; bytes: Buffer; ext: 'png' | 'jpg'; mime: string } | { ok: false; reason: string } {
  const m = /^data:(image\/(?:png|jpeg|jpg));base64,([A-Za-z0-9+/=\s]+)$/.exec(value.trim());
  if (!m) return { ok: false, reason: 'not_png_or_jpeg_data_uri' };
  const bytes = Buffer.from(m[2]!.replace(/\s+/g, ''), 'base64');
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > MAX_REQUEST_LOGO_BYTES) return { ok: false, reason: 'too_large' };
  const isPng = bytes.subarray(0, 8).equals(PNG_MAGIC);
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (m[1] === 'image/png' && isPng) return { ok: true, bytes, ext: 'png', mime: 'image/png' };
  if (m[1] !== 'image/png' && isJpeg) return { ok: true, bytes, ext: 'jpg', mime: 'image/jpeg' };
  return { ok: false, reason: 'bytes_do_not_match_type' };
}

/**
 * Guarda el logo del pedido (una vez por contenido: el mismo logo en 15 videos es un solo archivo)
 * y devuelve la marca para el video. Un logo inválido no rechaza el pedido: el video usa el logo de
 * la cuenta y se devuelve un aviso.
 */
export async function resolveRequestBrand(
  storage: StorageService,
  institutionId: string,
  input: RequestBrandInput | undefined,
  cache: Map<string, string>,
): Promise<ResolvedRequestBrand> {
  const warnings: string[] = [];
  if (!input) return { warnings };
  const brand: { logo_url?: string; institution_name?: string } = {};

  const name = input.institution_name?.trim();
  if (name) brand.institution_name = name.slice(0, 120);

  if (input.logo_data_uri) {
    const parsed = parseLogoDataUri(input.logo_data_uri);
    if (parsed.ok) {
      const hash = createHash('sha256').update(parsed.bytes).digest('hex').slice(0, 32);
      let url = cache.get(hash);
      if (!url) {
        url = await storage.uploadBuffer(parsed.bytes, `logos/${institutionId}/request/${hash}.${parsed.ext}`, parsed.mime);
        cache.set(hash, url);
      }
      brand.logo_url = url;
    } else {
      warnings.push(`brand_logo_ignored:${parsed.reason}`);
    }
  }

  return { brand: Object.keys(brand).length ? brand : undefined, warnings };
}
