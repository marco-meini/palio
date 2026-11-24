import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { InviteStatusDto } from '../../core/auth/dto';
import { InvitesApi } from '../../core/api/invites-api';
import { authErrorMessage } from '../../core/auth/auth-error';
import { AuthService } from '../../core/auth/auth.service';
import { createPasskey, passkeysSupported } from '../../core/auth/webauthn';
import { AuthShell } from '../../core/layout/auth-shell';

type Step = 'loading' | 'ready' | 'working' | 'done' | 'error';

/**
 * Pagina del link d'accesso (`/invito/:token`), usata per gli inviti e per il recupero.
 * L'utente crea la passkey qui, in Dimmelo, e appena è pronta entra.
 */
@Component({
  selector: 'app-invite',
  imports: [AuthShell, RouterLink],
  template: `
    <app-auth-shell>
      @switch (step()) {
        @case ('loading') {
          <p class="text-sm text-stone-600">Un attimo…</p>
        }
        @case ('error') {
          <h1 class="text-xl font-semibold text-stone-900">Link non disponibile</h1>
          <p class="mt-2 text-sm text-stone-600">{{ fatal() }}</p>
          <a
            routerLink="/accesso/recupero"
            class="mt-8 block w-full rounded-xl bg-amber-700 px-4 py-3 text-center text-sm font-medium text-white shadow-sm transition hover:bg-amber-800"
          >
            Mandami un nuovo link
          </a>
          <a routerLink="/accesso" class="mt-4 block text-sm text-stone-500 hover:text-stone-800">
            Ho già una passkey: accedi
          </a>
        }
        @case ('done') {
          <h1 class="text-xl font-semibold text-stone-900">Tutto pronto</h1>
          <p class="mt-2 text-sm text-stone-600">Ti porto in Dimmelo…</p>
        }
        @default {
          <h1 class="text-xl font-semibold text-stone-900">Ciao {{ invite()?.firstName }}!</h1>
          <p class="mt-2 text-sm text-stone-600">
            Per entrare in Dimmelo da questo dispositivo crea la tua passkey: niente password, usi
            Face ID, Touch ID o una chiavetta di sicurezza.
          </p>
          @if (error()) {
            <p class="mt-4 text-sm text-red-700" role="alert">{{ error() }}</p>
          }
          <button
            type="button"
            class="mt-8 block w-full rounded-xl bg-amber-700 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-wait disabled:opacity-70"
            [disabled]="step() === 'working'"
            (click)="create()"
          >
            {{ step() === 'working' ? 'Creazione…' : 'Crea la passkey' }}
          </button>
          <button
            type="button"
            class="mt-4 w-full text-center text-sm text-stone-600 hover:text-stone-900"
            (click)="signIn()"
          >
            Ho già una passkey su questo dispositivo: accedi
          </button>
          <p class="mt-6 text-xs leading-relaxed text-stone-500">
            Il link vale una sola volta: dopo aver creato la passkey entri con quella.
          </p>
        }
      }
    </app-auth-shell>
  `,
})
export class Invite {
  /** Parametro di rotta `token` (link d'accesso). */
  readonly token = input.required<string>();

  protected readonly step = signal<Step>('loading');
  protected readonly invite = signal<InviteStatusDto | null>(null);
  protected readonly error = signal('');
  protected readonly fatal = signal('');

  private readonly api = inject(InvitesApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    effect(() => void this.load(this.token()));
  }

  protected async create(): Promise<void> {
    if (!passkeysSupported()) {
      this.error.set('Questo browser non supporta le passkey.');
      return;
    }
    this.error.set('');
    this.step.set('working');
    try {
      const { passkeyId, options } = await this.api.startPasskey(this.token());
      const credential = await createPasskey(options);
      const user = await this.api.finishPasskey(this.token(), { passkeyId, credential });
      this.auth.signedIn(user, this.invite()?.email);
      this.step.set('done');
      await this.router.navigateByUrl('/');
    } catch (error) {
      if (error instanceof HttpErrorResponse && (error.status === 404 || error.status === 410)) {
        this.fail(error);
        return;
      }
      this.error.set(authErrorMessage(error));
      this.step.set('ready');
    }
  }

  /** Passkey già presente su questo dispositivo: si va alla pagina di accesso con l'email. */
  protected signIn(): void {
    const email = this.invite()?.email;
    if (email) this.auth.rememberEmail(email);
    void this.router.navigateByUrl('/accesso');
  }

  private async load(token: string): Promise<void> {
    try {
      this.invite.set(await this.api.status(token));
      this.step.set('ready');
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    this.fatal.set(
      status === 410
        ? 'Il link è scaduto.'
        : status === 404
          ? 'Il link non è valido o è già stato usato.'
          : 'Si è verificato un errore. Riprova tra poco.',
    );
    this.step.set('error');
  }
}
