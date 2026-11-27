import { Component } from '@angular/core';

/** Cornice a schermo intero delle pagine pubbliche di accesso (login, uscita, accesso negato). */
@Component({
  selector: 'app-auth-shell',
  template: `
    <div
      class="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-amber-50 via-stone-50 to-amber-50 px-4 py-12"
    >
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-amber-200/40 blur-3xl"
      ></div>
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -right-32 -bottom-32 size-96 rounded-full bg-amber-200/40 blur-3xl"
      ></div>

      <main class="relative w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center text-center">
          <img src="logo.svg" alt="" width="77" height="100" class="mb-3 h-24 w-auto drop-shadow-sm" />
          <span class="text-2xl font-semibold tracking-tight text-stone-900">Dimmelo</span>
          <span class="mt-1 text-sm text-stone-500">Database Palio di Siena</span>
        </div>
        <section
          class="rounded-2xl border border-white/60 bg-white/80 p-8 text-center shadow-xl shadow-amber-900/5 backdrop-blur"
        >
          <ng-content />
        </section>
      </main>
    </div>
  `,
})
export class AuthShell {}
