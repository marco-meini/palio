/**
 * Contratto con l'API (stessi tipi in `server/src/lib/auth/dto.ts` e
 * `server/src/lib/auth/permissions.ts`): aggiornare entrambi i lati.
 */

/**
 * Permessi `<sezione>.<azione>`: sono i ruoli del progetto Dimmelo su ZITADEL.
 * Etichette e raggruppamento li espone `GET /api/permissions`.
 */
export type Permission = 'chat.use' | 'users.view' | 'users.manage';

export interface CurrentUserDto {
  /** Id dell'utente su ZITADEL (lo stesso di `UserDto.id`). */
  id: string;
  displayName: string;
  email: string | null;
  /** Permessi effettivi: ruoli su ZITADEL più quelli impliciti (modificare → vedere). */
  permissions: Permission[];
}

/** Risposta del logout: dove mandare il browser per uscire anche da ZITADEL. */
export interface LogoutResponseDto {
  logoutUrl: string;
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

/**
 * Stato di un utente su Dimmelo: `invited` = ha accesso ma non è mai entrato, `disabled` =
 * accesso sospeso (permessi conservati).
 */
export type UserStatus = 'invited' | 'active' | 'disabled';

export interface UserDto {
  /** Id dell'utente su ZITADEL. */
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  /** Permessi assegnati (senza quelli impliciti). */
  permissions: Permission[];
  status: UserStatus;
  lastLoginAt: string | null;
  /** Da quando ha accesso a Dimmelo. */
  createdAt: string;
}

/** Dati modificabili di un utente (creazione e modifica). */
export interface UserInputDto {
  firstName: string;
  lastName: string;
  email: string;
  permissions: Permission[];
}

export type CreateUserDto = UserInputDto;
export type UpdateUserDto = UserInputDto;

/**
 * Invito da mandare all'utente:
 * - `passkey`: link monouso (scade presto) per registrare la passkey sulla pagina di accesso;
 * - `login`: l'account sa già entrare (passkey o Google), basta il link di Dimmelo.
 * Con `passkey` l'utente può anche entrare con Google, se l'account Google ha la stessa email.
 */
export interface InviteDto {
  kind: 'passkey' | 'login';
  url: string;
  /** Email d'invito (assente se l'invio email non è configurato): destinatario ed esito. */
  mail?: { to: string; sent: boolean };
}

export interface CreateUserResponseDto {
  user: UserDto;
  invite: InviteDto;
}
