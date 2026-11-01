// Clasificación de errores de un video: decide si se reintenta solo, si se pausa la cola o si
// alguien tiene que mirarlo.
//
// - transient: algo pasajero (OpenAI saturado, red, tiempo agotado). Se reintenta solo desde el
//   último paso completado, a los AUTO_RETRY_DELAYS_MIN minutos.
// - global: un problema que haría fallar a TODOS los videos (sin crédito, clave inválida, disco
//   lleno, navegador ausente). Se pausa la cola y el video espera en vez de fallar.
// - permanent: reintentar no lo arregla (contenido rechazado, error de programación). El video
//   queda "requiere atención" con el motivo en español, y se puede reintentar a mano.

export type FailureKind = 'transient' | 'global' | 'permanent';

export interface Failure {
  kind: FailureKind;
  /** Motivo para el usuario, en español y sin detalles técnicos. */
  reason: string;
  /** Mensaje técnico original, sin secretos. */
  detail: string;
}

/** Minutos de espera antes de cada reintento automático (su largo = máximo de reintentos). */
export const AUTO_RETRY_DELAYS_MIN = (process.env.AUTO_RETRY_DELAYS_MIN ?? '2,10,30')
  .split(',').map(Number).filter((n) => n > 0);

const RULES: Array<{ kind: FailureKind; pattern: RegExp; reason: string }> = [
  { kind: 'global', pattern: /insufficient_quota|exceeded your current quota|no credits|cuota agotada|billing/i,
    reason: 'Se agotó el crédito de OpenAI. Recarga saldo en platform.openai.com; la cola sigue sola después.' },
  { kind: 'global', pattern: /invalid api key|incorrect api key|api key inválida|OPENAI_API_KEY no configurada|401 Unauthorized/i,
    reason: 'La clave de OpenAI no es válida o expiró.' },
  { kind: 'global', pattern: /ENOSPC|no space left/i,
    reason: 'El servidor se quedó sin espacio en disco.' },
  { kind: 'global', pattern: /Failed to launch the browser|Could not find (Chrome|Chromium)|spawn ffmpeg ENOENT|ffmpeg: not found|Cannot find ffmpeg/i,
    reason: 'Falta una herramienta de render en el servidor (navegador o FFmpeg).' },
  { kind: 'permanent', pattern: /content_policy|moderation|safety system|rejected as a result of our safety/i,
    reason: 'OpenAI rechazó el contenido por su filtro de seguridad. Revisa el texto del capítulo.' },
  { kind: 'permanent', pattern: /no reintentable/i,
    reason: 'OpenAI rechazó la petición. Revisa el texto del capítulo.' },
  { kind: 'permanent', pattern: /is not a function|Cannot read propert|is not defined|is not iterable/i,
    reason: 'Error interno del sistema: necesita revisión técnica.' },
];

export function classifyFailure(err: unknown): Failure {
  const detail = sanitizeError(err instanceof Error ? err.message : String(err));
  for (const rule of RULES) {
    if (rule.pattern.test(detail)) return { kind: rule.kind, reason: rule.reason, detail };
  }
  return { kind: 'transient', reason: 'Falló varias veces seguidas por un error pasajero.', detail };
}

export function sanitizeError(message: string): string {
  return message
    .replace(/sk-[a-zA-Z0-9\-_]{20,}/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+[a-zA-Z0-9\-_.]{10,}/g, 'Bearer [REDACTED]')
    .replace(/xi-api-key[:\s]+[a-zA-Z0-9\-_]{10,}/gi, 'xi-api-key: [REDACTED]')
    .substring(0, 500);
}
