import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RecoveryApi } from '../../core/api/recovery-api';
import { AuthShell } from '../../core/layout/auth-shell';

/** "Non riesci ad accedere?": link via email per creare una passkey sul dispositivo in uso. */
@Component({
  selector: 'app-recovery',
  imports: [AuthShell, ReactiveFormsModule, RouterLink],
  template: `
    <app-auth-shell>
      @if (sent()) {
        <h1 class="text-xl font-semibold text-stone-900">Controlla la posta</h1>
        <p class="mt-2 text-sm text-stone-600">
          Se <strong class="font-medium text-stone-800">{{ form.controls.email.value }}</strong> è
          registrata in Dimmelo, ti abbiamo mandato un link per entrare. Aprilo da questo
          dispositivo: vale una sola volta e per poco tempo.
        </p>
        <p class="mt-4 text-xs leading-relaxed text-stone-500">
          Non arriva? Guarda anche nello spam, oppure chiedi a un amministratore.
        </p>
      } @else {
        <h1 class="text-xl font-semibold text-stone-900">Non riesci ad accedere?</h1>
        <p class="mt-2 text-sm text-stone-600">
          Succede con un telefono o un computer nuovo, o se la passkey non funziona più. Scrivi la
          tua email: ti mandiamo un link per creare una nuova passkey su questo dispositivo.
        </p>
        <form class="mt-6" [formGroup]="form" (ngSubmit)="submit()">
          <label for="email" class="block text-sm font-medium text-stone-700">Email</label>
          <input
            id="email"
            type="email"
            autocomplete="email"
            formControlName="email"
            class="mt-1 block w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 focus:outline-none"
          />
          @if (error()) {
            <p class="mt-2 text-sm text-red-700">{{ error() }}</p>
          }
          <button
            type="submit"
            class="mt-6 block w-full rounded-xl bg-amber-700 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-amber-800 disabled:cursor-wait disabled:opacity-70"
            [disabled]="sending()"
          >
            {{ sending() ? 'Invio…' : 'Mandami il link' }}
          </button>
        </form>
      }
      <a
        routerLink="/accesso"
        class="mt-6 block text-center text-sm text-stone-500 hover:text-stone-800"
      >
        Torna all'accesso
      </a>
    </app-auth-shell>
  `,
})
export class Recovery {
  private readonly api = inject(RecoveryApi);
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly sending = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    const email = this.form.controls.email.value.trim();
    if (this.form.invalid || !email) {
      this.error.set('Scrivi un indirizzo email valido.');
      return;
    }
    this.error.set('');
    this.sending.set(true);
    try {
      await this.api.request({ email });
      this.sent.set(true);
    } catch {
      this.error.set('Non è stato possibile inviare la richiesta. Riprova tra poco.');
    } finally {
      this.sending.set(false);
    }
  }
}
