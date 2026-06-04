import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    <div
      class="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-amber-50/80 to-stone-100 px-4"
    >
      <div
        class="w-full max-w-md rounded-2xl border border-stone-200/80 bg-white/90 p-8 shadow-sm backdrop-blur"
      >
        <h1 class="text-2xl font-semibold tracking-tight text-stone-900">Dimmelo</h1>
        <p class="mt-2 text-sm text-stone-600">
          Accesso riservato. Accedi con il tuo account Google autorizzato per usare
          l'assistente.
        </p>

        @if (errorMessage()) {
          <p
            class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {{ errorMessage() }}
          </p>
        }

        <button
          type="button"
          class="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          (click)="login()"
        >
          Accedi con Google
        </button>
      </div>
    </div>
  `,
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const error = this.route.snapshot.queryParamMap.get('error');
    const rejectedEmail = this.route.snapshot.queryParamMap.get('email');
    if (error === 'access_denied') {
      const hint = rejectedEmail
        ? ` Account usato: ${rejectedEmail}. Chiedi l’accesso a chi gestisce l’app (tabella dimmelo_users in Postgres), oppure accedi con un account già autorizzato.`
        : ' Contatta chi gestisce l’applicazione.';
      this.errorMessage.set(
        `Il tuo account Google non è autorizzato.${hint}`,
      );
    } else if (error) {
      this.errorMessage.set('Accesso non riuscito. Riprova.');
    }
  }

  login(): void {
    this.auth.login();
  }
}
