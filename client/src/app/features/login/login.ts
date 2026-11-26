import { Component, computed, inject, input } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AuthShell } from '../../core/layout/auth-shell';

/** Messaggi per i codici `?errore=` con cui il backend torna qui se l'accesso non riesce. */
const ERRORS: Record<string, string> = {
  scaduto: 'L’accesso è scaduto o è stato aperto in un’altra scheda. Riprova.',
  annullato: 'Accesso annullato.',
  negato: 'Il tuo account non ha accesso a Dimmelo. Chiedi a chi gestisce gli utenti di invitarti.',
  servizio: 'Il servizio di accesso non risponde. Riprova tra poco.',
};

/** Pagina di accesso: porta alla pagina di login del servizio di identità (passkey o Google). */
@Component({
  selector: 'app-login',
  imports: [AuthShell],
  template: `
    <app-auth-shell>
      <h1 class="text-xl font-semibold text-stone-900">Bentornato</h1>
      <p class="mt-2 text-sm text-stone-600">Accedi per fare domande sul Palio di Siena.</p>

      @if (message()) {
        <p
          class="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700"
          role="alert"
        >
          {{ message() }}
        </p>
      }

      <button
        type="button"
        class="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
        (click)="signIn()"
      >
        Accedi
      </button>

      <p class="mt-6 text-xs leading-relaxed text-stone-500">
        Entri con una passkey (Face ID, Touch ID, Windows Hello) o con il tuo account Google.
      </p>
    </app-auth-shell>
  `,
})
export class Login {
  /** Query param `returnTo`: dove tornare dopo l'accesso. */
  readonly returnTo = input<string>();
  /** Query param `errore`: perché l'accesso non è riuscito. */
  readonly errore = input<string>();

  private readonly auth = inject(AuthService);
  protected readonly message = computed(() => {
    const code = this.errore();
    return code ? (ERRORS[code] ?? 'Accesso non riuscito. Riprova.') : '';
  });

  protected signIn(): void {
    this.auth.login(this.destination());
  }

  /** Solo path interni (anti open-redirect; il backend lo ricontrolla). */
  private destination(): string {
    const target = this.returnTo();
    return target?.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')
      ? target
      : '/';
  }
}
