import { Injectable, computed, signal } from '@angular/core';

export interface AuthUser {
  email: string;
  name: string;
}

export interface AuthMeResponse {
  authEnabled?: boolean;
  email?: string | null;
  name?: string | null;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userState = signal<AuthUser | null>(null);

  /** Utente corrente dopo `getMe()` (email + nome da `dimmelo_users`). */
  readonly user = this.userState.asReadonly();

  /** Nome mostrato in chat (display_name). */
  readonly displayName = computed(() => this.userState()?.name ?? null);

  async getMe(): Promise<AuthMeResponse> {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (response.status === 401) {
        this.userState.set(null);
        return { authEnabled: true, error: 'Non autenticato' };
      }
      if (!response.ok) {
        this.userState.set(null);
        return { authEnabled: true, error: 'Servizio auth non disponibile' };
      }
      const data = (await response.json()) as AuthMeResponse;
      if (data.authEnabled === false) {
        this.userState.set(null);
        return data;
      }
      if (!data.email?.trim()) {
        this.userState.set(null);
        return { ...data, authEnabled: true, error: 'Non autenticato' };
      }
      const name = (data.name ?? data.email).trim();
      this.userState.set({ email: data.email.trim(), name });
      return { ...data, authEnabled: true, name };
    } catch {
      this.userState.set(null);
      return { authEnabled: true, error: 'Servizio auth non disponibile' };
    }
  }

  isAuthDisabled(me: AuthMeResponse): boolean {
    return me.authEnabled === false;
  }

  login(): void {
    window.location.href = '/api/auth/google';
  }

  async logout(): Promise<void> {
    this.userState.set(null);
    await fetch('/api/auth/logout', { credentials: 'include' });
    window.location.href = '/login';
  }
}
