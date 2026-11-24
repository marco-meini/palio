import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { authErrorMessage } from '../../core/auth/auth-error';
import { AuthService } from '../../core/auth/auth.service';
import { passkeysSupported } from '../../core/auth/webauthn';
import { AuthShell } from '../../core/layout/auth-shell';

/** Pagina di accesso: email e passkey, tutto qui, senza passare dal provider di identità. */
@Component({
  selector: 'app-login',
  imports: [AuthShell, ReactiveFormsModule, RouterLink],
  template: `
    <app-auth-shell>
      <h1 class="text-xl font-semibold text-stone-900">Bentornato</h1>
      <p class="mt-2 text-sm text-stone-600">Accedi per fare domande sul Palio di Siena.</p>

      <form class="mt-6 text-left" [formGroup]="form" (ngSubmit)="signIn()">
        <label for="email" class="block text-sm font-medium text-stone-700">Email</label>
        <input
          id="email"
          type="email"
          autocomplete="username webauthn"
          formControlName="email"
          class="mt-1 block w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 focus:outline-none"
        />
        @if (error()) {
          <p class="mt-2 text-sm text-red-700" role="alert">{{ error() }}</p>
        }
        <button
          type="submit"
          class="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-wait disabled:opacity-70"
          [disabled]="busy()"
        >
          @if (busy()) {
            <svg class="size-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                stroke-opacity=".3"
                stroke-width="3"
              />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
              />
            </svg>
            Verifica…
          } @else {
            <svg
              class="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="8" cy="15" r="4" />
              <path d="m10.85 12.15 8.65-8.65M18 5l2 2M15 8l2 2" />
            </svg>
            Accedi con passkey
          }
        </button>
      </form>

      <p class="mt-6 text-xs leading-relaxed text-stone-500">
        Niente password: usi Face ID, Touch ID o una chiavetta di sicurezza.
      </p>
      <a
        routerLink="/accesso/recupero"
        class="mt-4 block text-sm font-medium text-amber-700 hover:text-amber-900"
      >
        Non riesci ad accedere?
      </a>
    </app-auth-shell>
  `,
})
export class Login {
  /** Query param `returnTo`: dove tornare dopo l'accesso. */
  readonly returnTo = input<string>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: [this.auth.rememberedEmail(), [Validators.required, Validators.email]],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async signIn(): Promise<void> {
    const email = this.form.controls.email.value.trim().toLowerCase();
    if (this.form.invalid || !email) {
      this.error.set('Scrivi la tua email.');
      return;
    }
    if (!passkeysSupported()) {
      this.error.set('Questo browser non supporta le passkey.');
      return;
    }
    this.error.set('');
    this.busy.set(true);
    try {
      await this.auth.passkeyLogin(email);
      await this.router.navigateByUrl(this.destination());
    } catch (error) {
      this.error.set(authErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** Solo path interni (anti open-redirect). */
  private destination(): string {
    const target = this.returnTo();
    return target?.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')
      ? target
      : '/';
  }
}
