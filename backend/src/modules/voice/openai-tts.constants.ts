// Modelo TTS de OpenAI por defecto. Se usa el snapshot fijado en vez del alias
// 'gpt-4o-mini-tts': desde 2026-10-15/16 el alias deja requests colgadas
// (125–172 s, facturadas) y los jobs fallan tras 3 intentos; el snapshot no.
// Un `external_metadata.tts_model` explícito en el job sigue teniendo prioridad,
// y OPENAI_TTS_MODEL permite sobreescribirlo sin cambiar código.
export const DEFAULT_OPENAI_TTS_MODEL = 'gpt-4o-mini-tts-2025-03-20';

// Voz por defecto: 'cedar' ganó la prueba a ciegas del 2026-10-31 frente a marin/coral/ash.
export const DEFAULT_OPENAI_TTS_VOICE = 'cedar';

// Indicaciones de estilo para gpt-4o-mini-tts (tts-1 no las soporta). Costo: unos
// pocos tokens de texto por escena. OPENAI_TTS_INSTRUCTIONS permite sobreescribirlas.
export const DEFAULT_OPENAI_TTS_INSTRUCTIONS =
  'Habla en español latinoamericano neutro, sin acento de España. Eres un docente cercano y ' +
  'entusiasta explicando a estudiantes adultos. Ritmo pausado y claro, unas 140 palabras por ' +
  'minuto. Haz una pausa breve después de cada idea clave y enfatiza las palabras importantes. ' +
  'Tono cálido y conversacional, nunca robótico ni de locutor de noticias.';

export function ttsModelSupportsInstructions(model: string): boolean {
  return model.startsWith('gpt-4o-mini-tts');
}
