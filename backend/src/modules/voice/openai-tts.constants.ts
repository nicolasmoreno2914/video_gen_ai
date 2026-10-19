// Modelo TTS de OpenAI por defecto. Se usa el snapshot fijado en vez del alias
// 'gpt-4o-mini-tts': desde 2026-10-15/16 el alias deja requests colgadas
// (125–172 s, facturadas) y los jobs fallan tras 3 intentos; el snapshot no.
// Un `external_metadata.tts_model` explícito en el job sigue teniendo prioridad,
// y OPENAI_TTS_MODEL permite sobreescribirlo sin cambiar código.
export const DEFAULT_OPENAI_TTS_MODEL = 'gpt-4o-mini-tts-2025-03-20';
