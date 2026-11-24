import { badRequest } from '../http-error.js';
import type { PasskeyCredentialDto } from './dto.js';

const MAX_FIELD = 16_384;

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_FIELD;

/**
 * Valida la forma della passkey inviata dal browser (JSON con binari in base64url) prima di
 * passarla a ZITADEL, che ne verifica il contenuto crittografico.
 */
export function parseCredential(value: unknown): PasskeyCredentialDto {
  const input = (value ?? {}) as Record<string, unknown>;
  const response = input['response'];
  if (
    !isText(input['id']) ||
    !isText(input['rawId']) ||
    input['type'] !== 'public-key' ||
    !response ||
    typeof response !== 'object' ||
    Array.isArray(response)
  ) {
    throw badRequest('Passkey non valida');
  }
  const fields: Record<string, string | null> = {};
  for (const [key, field] of Object.entries(response)) {
    if (field !== null && !isText(field)) throw badRequest('Passkey non valida');
    fields[key] = field;
  }
  return { id: input['id'], rawId: input['rawId'], type: 'public-key', response: fields };
}

/** Nome della passkey su ZITADEL, ricavato dal browser (es. "iPhone (Dimmelo)"). */
export function passkeyName(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Dispositivo';
  return `${device} (Dimmelo)`;
}
