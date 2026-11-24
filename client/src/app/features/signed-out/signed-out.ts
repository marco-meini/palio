import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthShell } from '../../core/layout/auth-shell';

/** Pagina pubblica mostrata dopo il logout. */
@Component({
  selector: 'app-signed-out',
  imports: [AuthShell, RouterLink],
  template: `
    <app-auth-shell>
      <h1 class="text-xl font-semibold text-stone-900">A presto!</h1>
      <p class="mt-2 text-sm text-stone-600">Sei uscito da Dimmelo su questo dispositivo.</p>
      <a
        routerLink="/accesso"
        class="mt-8 block w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-50"
      >
        Accedi di nuovo
      </a>
    </app-auth-shell>
  `,
})
export class SignedOut {}
