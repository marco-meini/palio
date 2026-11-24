import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router, type UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { CurrentUserDto, PasskeyLoginStartResponseDto, Permission } from './dto';
import { usePasskey } from './webauthn';

/** Email dell'ultimo accesso, per non doverla riscrivere (solo comodità, nessun segreto). */
const EMAIL_KEY = 'dimmelo.email';

/**
 * Stato di autenticazione. La sessione è un cookie httpOnly gestito dal backend:
 * il frontend non vede né conserva token, chiede solo chi è l'utente corrente.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly current = signal<CurrentUserDto | null>(null);

  readonly user = this.current.asReadonly();
  readonly isAuthenticated = computed(() => this.current() !== null);
  readonly isAdmin = computed(() => this.current()?.isAdmin ?? false);

  /** Carica l'utente corrente (all'avvio dell'app). Non lancia: se non autenticato, `user` è null. */
  async load(): Promise<void> {
    try {
      this.current.set(await firstValueFrom(this.http.get<CurrentUserDto>('/api/auth/me')));
    } catch {
      this.current.set(null);
    }
  }

  /**
   * Accesso con passkey nella pagina di Dimmelo: il backend chiede la challenge al provider di
   * identità, il browser la firma (Face ID, Touch ID…), il backend la fa verificare e apre la
   * sessione. Lancia l'errore HTTP o del browser se qualcosa non va.
   */
  async passkeyLogin(email: string): Promise<CurrentUserDto> {
    const { options } = await firstValueFrom(
      this.http.post<PasskeyLoginStartResponseDto>('/api/auth/passkey/start', { email }),
    );
    const credential = await usePasskey(options);
    const user = await firstValueFrom(
      this.http.post<CurrentUserDto>('/api/auth/passkey/finish', { credential }),
    );
    this.signedIn(user, email);
    return user;
  }

  /** Sessione aperta (login o creazione della passkey dall'invito). */
  signedIn(user: CurrentUserDto, email = user.email): void {
    if (email) this.rememberEmail(email);
    this.current.set(user);
  }

  rememberedEmail(): string {
    try {
      return localStorage.getItem(EMAIL_KEY) ?? '';
    } catch {
      return '';
    }
  }

  rememberEmail(email: string): void {
    try {
      localStorage.setItem(EMAIL_KEY, email);
    } catch {
      // storage non disponibile (navigazione privata): pazienza
    }
  }

  /** URL della pagina di accesso, con la destinazione a cui tornare. */
  loginPage(returnTo = this.router.url): UrlTree {
    const queryParams = returnTo && returnTo !== '/' ? { returnTo } : {};
    return this.router.createUrlTree(['/accesso'], { queryParams });
  }

  /** Sessione scaduta o assente: azzera l'utente e mostra la pagina di accesso. */
  sessionExpired(): void {
    if (this.router.url.startsWith('/accesso')) return;
    const page = this.loginPage();
    this.current.set(null);
    void this.router.navigateByUrl(page);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>('/api/auth/logout', null));
    } catch {
      // sessione già scaduta o server irraggiungibile: si esce comunque da questo browser
    }
    this.current.set(null);
    await this.router.navigateByUrl('/uscito');
  }

  /**
   * `true` se l'utente ha il permesso (il backend manda già quelli effettivi: impliciti e, per
   * l'amministratore, tutti). Serve a mostrare o nascondere: il controllo vero è sul backend.
   */
  can(permission: Permission): boolean {
    return this.current()?.permissions.includes(permission) ?? false;
  }
}
