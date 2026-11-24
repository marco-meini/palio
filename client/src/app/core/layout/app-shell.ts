import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../auth/auth.service';

const LINK = 'rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900';
const ACTIVE = '!bg-amber-100 !text-amber-900';

/** Cornice dell'area riservata: intestazione con navigazione, utente ed «Esci». */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  host: { class: 'flex h-dvh flex-col bg-gradient-to-b from-amber-50/80 to-stone-100' },
  template: `
    <header class="border-b border-stone-200/80 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
      <div class="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2">
        <a routerLink="/" class="mr-auto">
          <span class="block text-lg font-semibold text-stone-900">Dimmelo</span>
          <span class="block text-xs text-stone-500">Database Palio di Siena</span>
        </a>
        @if (showNav()) {
          <nav class="flex gap-1" aria-label="Sezioni">
            @if (auth.can('chat.use')) {
              <a
                routerLink="/"
                [class]="link"
                [routerLinkActive]="active"
                [routerLinkActiveOptions]="{ exact: true }"
                >Chat</a
              >
            }
            @if (auth.can('users.view')) {
              <a routerLink="/utenti" [class]="link" [routerLinkActive]="active">Utenti</a>
            }
          </nav>
        }
        <div class="flex items-center gap-3 text-sm">
          <span class="hidden text-stone-600 sm:inline">{{ auth.user()?.displayName }}</span>
          <button type="button" [class]="link" (click)="auth.logout()">Esci</button>
        </div>
      </div>
    </header>
    <main class="min-h-0 flex-1 overflow-y-auto">
      <router-outlet />
    </main>
  `,
})
export class AppShell {
  protected readonly auth = inject(AuthService);
  protected readonly link = LINK;
  protected readonly active = ACTIVE;
  /** La navigazione serve solo a chi vede più di una sezione. */
  protected readonly showNav = computed(() => this.auth.can('users.view'));
}
