/**
 * Contratto con l'API (stessi tipi in `server/src/lib/auth/dto.ts` e
 * `server/src/lib/auth/permissions.ts`): aggiornare entrambi i lati.
 */

/** Permessi `<sezione>.<azione>`. Etichette e raggruppamento li espone `GET /api/permissions`. */
export type Permission = 'chat.use' | 'users.view' | 'users.manage';

export interface CurrentUserDto {
  id: number;
  displayName: string;
  email: string | null;
  /** Amministratore: tutti i permessi, anche quelli delle funzioni future. */
  isAdmin: boolean;
  /** Permessi effettivi: assegnati, impliciti (modificare → vedere), tutti se amministratore. */
  permissions: Permission[];
}

export interface PermissionDto {
  key: Permission;
  label: string;
  description: string;
  /** Permessi compresi in questo (es. modificare comprende vedere). */
  implies: Permission[];
}

/** Sezione dell'app con i suoi permessi, per la pagina di modifica degli utenti. */
export interface PermissionSectionDto {
  key: string;
  label: string;
  permissions: PermissionDto[];
}

/** Richiesta di recupero dell'accesso (`POST /api/auth/recovery`): risposta sempre 202. */
export interface RecoveryRequestDto {
  email: string;
}

/**
 * Opzioni WebAuthn in JSON, come le genera il provider di identità: i campi binari
 * (`challenge`, `user.id`, id delle credenziali) sono stringhe base64url.
 * Il frontend le converte prima di passarle a `navigator.credentials`.
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

export type CreateUserDto = UserInputDto;
export type UpdateUserDto = UserInputDto;

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

/** Fine della creazione (`POST /api/invites/:token/passkey/finish`): risponde con l'utente entrato. */
export interface PasskeyRegistrationFinishDto {
  passkeyId: string;
  credential: PasskeyCredentialDto;
}
