import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router, type UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { CurrentUserDto, LogoutResponseDto, Permission } from './dto';

/** Navigazione del browser fuori dall'app (login e logout su ZITADEL); sostituibile nei test. */
export const browserLocation = {
  assign(url: string): void {
    window.location.assign(url);
  },
};

/**
 * Stato di autenticazione. Il login avviene sulla pagina di ZITADEL (OIDC) e la sessione è un
 * cookie httpOnly gestito dal backend: il frontend non vede né conserva token, chiede solo chi
 * è l'utente corrente.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly current = signal<CurrentUserDto | null>(null);

  readonly user = this.current.asReadonly();
  readonly isAuthenticated = computed(() => this.current() !== null);

  /** Carica l'utente corrente (all'avvio dell'app). Non lancia: se non autenticato, `user` è null. */
  async load(): Promise<void> {
    try {
      this.current.set(await firstValueFrom(this.http.get<CurrentUserDto>('/api/auth/me')));
    } catch {
      this.current.set(null);
    }
  }

  /** Va alla pagina di accesso di ZITADEL; dopo l'accesso il backend riporta a `returnTo`. */
  login(returnTo = '/'): void {
    browserLocation.assign(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  /** Utente corrente impostato a mano (es. nei test). */
  signedIn(user: CurrentUserDto): void {
    this.current.set(user);
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

  /** Esce da Dimmelo e da ZITADEL (che poi riporta a `/uscito`). */
  async logout(): Promise<void> {
    let target = '/uscito';
    try {
      target = (await firstValueFrom(this.http.post<LogoutResponseDto>('/api/auth/logout', null)))
        .logoutUrl;
    } catch {
      // sessione già scaduta o server irraggiungibile: si esce comunque da questo browser
    }
    this.current.set(null);
    browserLocation.assign(target);
  }

  /**
   * `true` se l'utente ha il permesso (il backend manda già quelli effettivi, impliciti
   * compresi). Serve a mostrare o nascondere: il controllo vero è sul backend.
   */
  can(permission: Permission): boolean {
    return this.current()?.permissions.includes(permission) ?? false;
  }
}
