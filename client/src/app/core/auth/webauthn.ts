import type { PasskeyCredentialDto, WebAuthnOptionsJson } from './dto';

/**
 * Passkey nella pagina di Dimmelo (WebAuthn). Il provider di identità manda le opzioni in JSON
 * con i binari in base64url; qui si convertono per `navigator.credentials` e si serializza la
 * risposta del browser per rimandarla al backend.
 */

/** base64url (o base64 standard) → ArrayBuffer. */
export function fromBase64url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** ArrayBuffer → base64url senza padding. */
export function toBase64url(buffer: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type Descriptor = { id: string } & Record<string, unknown>;

const descriptors = (list: unknown) =>
  ((list as Descriptor[] | undefined) ?? []).map((d) => ({ ...d, id: fromBase64url(d.id) }));

export function creationOptions(json: WebAuthnOptionsJson): PublicKeyCredentialCreationOptions {
  const user = json['user'] as { id: string } & Record<string, unknown>;
  return {
    ...json,
    challenge: fromBase64url(json['challenge'] as string),
    user: { ...user, id: fromBase64url(user.id) },
    excludeCredentials: descriptors(json['excludeCredentials']),
  } as unknown as PublicKeyCredentialCreationOptions;
}

export function requestOptions(json: WebAuthnOptionsJson): PublicKeyCredentialRequestOptions {
  return {
    ...json,
    challenge: fromBase64url(json['challenge'] as string),
    allowCredentials: descriptors(json['allowCredentials']),
  } as unknown as PublicKeyCredentialRequestOptions;
}

export function credentialToJson(credential: PublicKeyCredential): PasskeyCredentialDto {
  const response = credential.response;
  const fields: Record<string, string | null> = {
    clientDataJSON: toBase64url(response.clientDataJSON),
  };
  if ('attestationObject' in response) {
    fields['attestationObject'] = toBase64url(
      (response as AuthenticatorAttestationResponse).attestationObject,
    );
  } else {
    const assertion = response as AuthenticatorAssertionResponse;
    fields['authenticatorData'] = toBase64url(assertion.authenticatorData);
    fields['signature'] = toBase64url(assertion.signature);
    fields['userHandle'] = assertion.userHandle ? toBase64url(assertion.userHandle) : null;
  }
  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: credential.type,
    response: fields,
  };
}

export function passkeysSupported(): boolean {
  return (
    typeof window !== 'undefined' && 'PublicKeyCredential' in window && !!navigator.credentials
  );
}

/** Crea una passkey (Face ID, Touch ID, chiavetta…). */
export async function createPasskey(options: WebAuthnOptionsJson): Promise<PasskeyCredentialDto> {
  const credential = await navigator.credentials.create({ publicKey: creationOptions(options) });
  if (!credential) throw new DOMException('Nessuna passkey creata', 'NotAllowedError');
  return credentialToJson(credential as PublicKeyCredential);
}

/** Usa una passkey esistente per firmare la challenge. */
export async function usePasskey(options: WebAuthnOptionsJson): Promise<PasskeyCredentialDto> {
  const credential = await navigator.credentials.get({ publicKey: requestOptions(options) });
  if (!credential) throw new DOMException('Nessuna passkey scelta', 'NotAllowedError');
  return credentialToJson(credential as PublicKeyCredential);
}

/** Errori del browser durante la creazione o l'uso di una passkey, in italiano. */
export function passkeyError(error: unknown): string | null {
  if (!(error instanceof DOMException)) return null;
  switch (error.name) {
    case 'NotAllowedError':
    case 'AbortError':
      return 'Operazione annullata o scaduta. Riprova.';
    case 'InvalidStateError':
      return 'Su questo dispositivo hai già una passkey per Dimmelo: usa «Accedi».';
    case 'NotSupportedError':
      return 'Questo browser non supporta le passkey.';
    case 'SecurityError':
      return 'Il browser ha rifiutato la passkey per questo indirizzo.';
    default:
      return `La passkey non ha funzionato (${error.name}).`;
  }
}
