import type { Permission } from './permissions.js';

/** Contratto con il client (stessi tipi in `client/src/app/core/auth/dto.ts`). */

export interface CurrentUserDto {
  id: number;
  displayName: string;
  email: string | null;
  /** Amministratore: tutti i permessi, anche quelli delle funzioni future. */
  isAdmin: boolean;
  /** Permessi effettivi: assegnati, impliciti (modificare → vedere), tutti se amministratore. */
  permissions: Permission[];
}

/**
 * Opzioni WebAuthn in JSON, come le genera il provider di identità: i campi binari
 * (`challenge`, `user.id`, id delle credenziali) sono stringhe base64url.
 */
export type WebAuthnOptionsJson = Record<string, unknown>;

/** Passkey creata o usata dal browser, serializzata in JSON (binari in base64url). */
export interface PasskeyCredentialDto {
  id: string;
  rawId: string;
  type: string;
  response: Record<string, string | null>;
}

export interface PasskeyLoginStartResponseDto {
  /** Opzioni per `navigator.credentials.get`. */
  options: WebAuthnOptionsJson;
}

/** Stato di un utente: `invited` = censito ma non ha ancora mai fatto l'accesso. */
export type UserStatus = 'invited' | 'active' | 'disabled';

export interface UserDto {
  id: number;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string | null;
  isAdmin: boolean;
  /** Permessi assegnati (senza quelli impliciti). */
  permissions: Permission[];
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Dati modificabili di un utente (creazione e modifica). */
export interface UserInputDto {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isAdmin: boolean;
  permissions: Permission[];
}

/** Link d'invito monouso: l'utente lo apre, crea la passkey ed entra. */
export interface InviteDto {
  url: string;
  expiresAt: string;
}

export interface CreateUserResponseDto {
  user: UserDto;
  invite: InviteDto;
}

/** Pagina pubblica dell'invito (`GET /api/invites/:token`). */
export interface InviteStatusDto {
  firstName: string;
  email: string;
  expiresAt: string;
}

/** Inizio della creazione della passkey (`POST /api/invites/:token/passkey/start`). */
export interface PasskeyRegistrationStartResponseDto {
  passkeyId: string;
  /** Opzioni per `navigator.credentials.create`. */
  options: WebAuthnOptionsJson;
}
