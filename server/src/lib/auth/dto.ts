import type { Permission } from './permissions.js';

/** Contratto con il client (stessi tipi in `client/src/app/core/auth/dto.ts`). */

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

/**
 * Stato di un utente su Dimmelo: `invited` = ha accesso ma non è mai entrato, `disabled` =
 * accesso sospeso (ruoli conservati).
 */
export type UserStatus = 'invited' | 'active' | 'disabled';

export interface UserDto {
  /** Id dell'utente su ZITADEL. */
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  /** Permessi assegnati (ruoli del progetto, senza quelli impliciti). */
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

/**
 * Link per registrare una passkey sulla pagina di login di ZITADEL (monouso, scade dopo poco).
 * In alternativa l'utente entra con Google, se l'account Google ha la stessa email.
 */
export interface InviteDto {
  url: string;
}

export interface CreateUserResponseDto {
  user: UserDto;
  invite: InviteDto;
}
