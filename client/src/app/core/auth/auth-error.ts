import { toApiError } from '../api/users-api';
import { passkeyError } from './webauthn';

/** Messaggio per l'utente da un errore del browser (passkey) o dell'API. */
export function authErrorMessage(error: unknown): string {
  return passkeyError(error) ?? toApiError(error).message;
}
