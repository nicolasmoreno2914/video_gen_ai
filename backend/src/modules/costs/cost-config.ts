// Catálogo central de precios — ÚNICO lugar donde viven las tarifas.
// Los servicios reportan unidades reales (tokens, caracteres, segundos, imágenes)
// y este módulo calcula el costo. Si un proveedor cambia precios, se actualiza aquí,
// se sube PRICING_VERSION y se recalculan los jobs con POST /api/costs/videos/:id/rebuild?reprice=true.
//
// `verified: false` = precio tomado de fuentes secundarias o dependiente del plan
// contratado; confirmarlo contra la factura del proveedor en la conciliación mensual.

export const PRICING_VERSION = '2026-10-30';

export interface PriceResult {
  cost: number;
  /** Metadata a guardar junto al log para poder auditar/recalcular. */
  pricing: {
    version: string;
    verified: boolean;
    /** true si el modelo no está en el catálogo y se usó una tarifa por defecto. */
    fallback: boolean;
  };
}

function result(cost: number, verified: boolean, fallback = false): PriceResult {
  return {
    cost: Math.round(cost * 1_000_000) / 1_000_000,
    pricing: { version: PRICING_VERSION, verified: verified && !fallback, fallback },
  };
}

/** Busca la entrada cuyo nombre sea el prefijo más largo del modelo (cubre snapshots fechados). */
function matchModel<T>(table: Record<string, T>, model: string): T | undefined {
  const key = Object.keys(table)
    .filter((k) => model === k || model.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? table[key] : undefined;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw != null && raw.trim() !== '' ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ─── Texto (chat completions) ────────────────────────────────────────────────
// USD por 1M tokens.

const CHAT_MODELS: Record<string, { input: number; output: number; verified: boolean }> = {
  'gpt-4o': { input: 2.5, output: 10, verified: true },
  'gpt-4o-mini': { input: 0.15, output: 0.6, verified: true },
  'gpt-4.1': { input: 2, output: 8, verified: true },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, verified: true },
  'gpt-4.1-nano': { input: 0.1, output: 0.4, verified: true },
};

export function priceChat(model: string, inputTokens: number, outputTokens: number): PriceResult {
  const entry = matchModel(CHAT_MODELS, model);
  const p = entry ?? CHAT_MODELS['gpt-4o'];
  const cost = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  return result(cost, p.verified, !entry);
}

// ─── Imágenes ────────────────────────────────────────────────────────────────

export interface ImageUsage {
  /** Tokens de texto del prompt (gpt-image devuelve usage.input_tokens_details.text_tokens). */
  textInputTokens?: number;
  /** Tokens de imagen de entrada (ediciones / referencias). */
  imageInputTokens?: number;
  outputTokens?: number;
}

// gpt-image-*: USD por 1M tokens. Si la API devuelve `usage`, se cobra por tokens reales.
const IMAGE_TOKEN_MODELS: Record<string, { text: number; imageIn: number; out: number; verified: boolean }> = {
  'gpt-image-1': { text: 5, imageIn: 10, out: 40, verified: true },
  'gpt-image-1-mini': { text: 2, imageIn: 2.5, out: 8, verified: true },
  'gpt-image-1.5': { text: 5, imageIn: 8, out: 32, verified: false },
  'gpt-image-2': { text: 5, imageIn: 8, out: 30, verified: false },
};

// Precio por imagen cuando no hay `usage` (o para dall-e-*). Clave: calidad → [cuadrada, no cuadrada].
const IMAGE_FLAT_MODELS: Record<string, { prices: Record<string, [number, number]>; verified: boolean }> = {
  'dall-e-3': { prices: { standard: [0.04, 0.08], hd: [0.08, 0.12] }, verified: true },
  'dall-e-2': { prices: { standard: [0.02, 0.02] }, verified: true },
  'gpt-image-1': { prices: { low: [0.011, 0.016], medium: [0.042, 0.063], high: [0.167, 0.25] }, verified: true },
  'gpt-image-1-mini': { prices: { low: [0.005, 0.006], medium: [0.011, 0.015], high: [0.036, 0.052] }, verified: true },
  'gpt-image-1.5': { prices: { low: [0.009, 0.013], medium: [0.034, 0.05], high: [0.133, 0.2] }, verified: false },
  'gpt-image-2': { prices: { low: [0.009, 0.013], medium: [0.034, 0.05], high: [0.133, 0.2] }, verified: false },
};

function normalizeImageQuality(model: string, quality: string): string {
  const q = quality.toLowerCase();
  if (model.startsWith('dall-e')) return q === 'hd' || q === 'high' ? 'hd' : 'standard';
  if (q === 'standard' || q === 'auto') return 'medium';
  if (q === 'hd') return 'high';
  return q;
}

/** Costo de UNA imagen. */
export function priceImage(
  model: string,
  size: string,
  quality: string,
  usage?: ImageUsage | null,
): PriceResult {
  const tokenEntry = matchModel(IMAGE_TOKEN_MODELS, model);
  if (tokenEntry && usage && (usage.outputTokens ?? 0) > 0) {
    const cost =
      ((usage.textInputTokens ?? 0) / 1_000_000) * tokenEntry.text +
      ((usage.imageInputTokens ?? 0) / 1_000_000) * tokenEntry.imageIn +
      ((usage.outputTokens ?? 0) / 1_000_000) * tokenEntry.out;
    return result(cost, tokenEntry.verified);
  }

  const flatEntry = matchModel(IMAGE_FLAT_MODELS, model);
  const flat = flatEntry ?? IMAGE_FLAT_MODELS['gpt-image-1'];
  const q = normalizeImageQuality(flatEntry ? model : 'gpt-image-1', quality);
  const pair = flat.prices[q] ?? Object.values(flat.prices)[0];
  const [w, h] = size.split('x').map(Number);
  const square = w > 0 && w === h;
  return result(square ? pair[0] : pair[1], flat.verified, !flatEntry);
}

/** Extrae el `usage` de una respuesta de images.generate (solo gpt-image lo devuelve). */
export function imageUsageFromResponse(response: unknown): ImageUsage | null {
  const usage = (response as {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { text_tokens?: number; image_tokens?: number };
    };
  })?.usage;
  if (!usage) return null;
  return {
    textInputTokens: usage.input_tokens_details?.text_tokens ?? usage.input_tokens ?? 0,
    imageInputTokens: usage.input_tokens_details?.image_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
  };
}

// ─── Voz (TTS) ───────────────────────────────────────────────────────────────

// OpenAI: tts-1/tts-1-hd cobran por carácter; gpt-4o-mini-tts por tokens de texto
// (≈ 4 chars/token) + tokens de audio, que OpenAI estima en ≈ $0.015 por minuto.
const OPENAI_TTS_MODELS: Record<
  string,
  { perMillionChars?: number; textPerMillionTokens?: number; perAudioMinute?: number; verified: boolean }
> = {
  'tts-1': { perMillionChars: 15, verified: true },
  'tts-1-hd': { perMillionChars: 30, verified: true },
  'gpt-4o-mini-tts': { textPerMillionTokens: 0.6, perAudioMinute: 0.015, verified: true },
};

export function priceOpenAiTts(model: string, characters: number, audioSeconds: number): PriceResult {
  const entry = matchModel(OPENAI_TTS_MODELS, model);
  const p = entry ?? OPENAI_TTS_MODELS['gpt-4o-mini-tts'];
  const cost =
    (characters / 1_000_000) * (p.perMillionChars ?? 0) +
    (characters / 4 / 1_000_000) * (p.textPerMillionTokens ?? 0) +
    (audioSeconds / 60) * (p.perAudioMinute ?? 0);
  return result(cost, p.verified, !entry);
}

// ─── Transcripción (STT) ─────────────────────────────────────────────────────
// USD por minuto de audio.

const STT_MODELS: Record<string, { perMinute: number; verified: boolean }> = {
  'whisper-1': { perMinute: 0.006, verified: true },
  'gpt-4o-transcribe': { perMinute: 0.006, verified: true },
  'gpt-4o-mini-transcribe': { perMinute: 0.003, verified: true },
};

export function priceStt(model: string, audioSeconds: number): PriceResult {
  const entry = matchModel(STT_MODELS, model);
  const p = entry ?? STT_MODELS['whisper-1'];
  return result((audioSeconds / 60) * p.perMinute, p.verified, !entry);
}

// ─── Infraestructura propia ──────────────────────────────────────────────────
// Costo del servidor de render prorrateado por minuto de video → RENDER_USD_PER_MINUTE.

export function priceRender(videoSeconds: number): PriceResult {
  return result((videoSeconds / 60) * envNumber('RENDER_USD_PER_MINUTE', 0.02), false);
}

// ─── Recalcular un log existente ─────────────────────────────────────────────

interface RepriceableLog {
  provider: string;
  operation: string;
  model_name: string | null;
  input_units: number | null;
  output_units: number | null;
  metadata: object | null;
}

/**
 * Recalcula el costo de un log ya guardado a partir de sus unidades.
 * Devuelve null si el log no tiene datos suficientes (se conserva su costo original).
 */
export function repriceUsageLog(log: RepriceableLog): PriceResult | null {
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const model = log.model_name ?? '';

  switch (log.provider) {
    case 'openai_chat':
      if (!model) return null;
      return priceChat(model, log.input_units ?? 0, log.output_units ?? 0);
    case 'openai_dalle': {
      if (!model) return null;
      const usage: ImageUsage = {
        textInputTokens: num(meta.text_input_tokens),
        imageInputTokens: num(meta.image_input_tokens),
        outputTokens: num(meta.output_tokens),
      };
      const one = priceImage(model, String(meta.size ?? '1024x1024'), String(meta.quality ?? 'medium'), usage);
      const count = usage.outputTokens ? 1 : num(meta.image_count) || 1;
      return { ...one, cost: Math.round(one.cost * count * 1_000_000) / 1_000_000 };
    }
    case 'openai_tts':
      if (!model) return null;
      return priceOpenAiTts(model, (log.input_units ?? 0) + num(meta.instructions_characters), num(meta.duration_seconds));
    // elevenlabs: proveedor retirado — sus logs históricos conservan el costo original.
    case 'openai_stt':
      return priceStt(model || 'whisper-1', log.input_units ?? 0);
    case 'internal':
      if (log.operation !== 'render') return null;
      return priceRender(log.input_units ?? 0);
    default:
      return null;
  }
}
