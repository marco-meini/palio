import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthShell } from '../../core/layout/auth-shell';

/** Pagina riservata a un ruolo che l'utente non ha. */
@Component({
  selector: 'app-access-denied',
  imports: [AuthShell, RouterLink],
  template: `
    <app-auth-shell>
      <h1 class="text-xl font-semibold text-stone-900">Accesso non consentito</h1>
      <p class="mt-2 text-sm text-stone-600">Non hai i permessi per aprire questa pagina.</p>
      <a
        routerLink="/"
        class="mt-8 block w-full rounded-xl bg-amber-700 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-amber-800"
      >
        Torna alla home
      </a>
    </app-auth-shell>
  `,
})
export class AccessDenied {}
