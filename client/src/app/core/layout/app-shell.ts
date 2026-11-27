import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { Icon, ICONS } from './icon';
import { NAV_ITEMS } from './nav';

/** Preferenza "sidebar ridotta" su desktop, ricordata dal browser. */
const COLLAPSED_KEY = 'dimmelo.sidebar.collapsed';

/**
 * Cornice dell'area riservata (come in dimora): sidebar a sinistra con le pagine e l'utente.
 * - desktop: sidebar fissa, riducibile alle sole icone (scelta ricordata)
 * - mobile: barra in alto con ☰; la sidebar si apre sopra il contenuto e si chiude
 *   toccando fuori, con Esc o scegliendo una voce
 * Il contenuto occupa l'altezza della finestra e scorre da sé (la chat tiene il campo in basso);
 * margini e larghezza li decide ogni pagina.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  host: {
    class: 'block h-dvh bg-gradient-to-b from-amber-50/80 to-stone-100',
    '(document:keydown.escape)': 'mobileOpen.set(false)',
  },
  template: `
    @if (mobileOpen()) {
      <div
        class="fixed inset-0 z-40 bg-stone-900/40 lg:hidden"
        aria-hidden="true"
        (click)="mobileOpen.set(false)"
      ></div>
    }

    <aside id="sidebar" [class]="asideClass()" aria-label="Menu principale">
      <div class="flex h-14 items-center gap-2 border-b border-stone-200 px-3">
        <a
          routerLink="/"
          class="flex min-w-0 items-center gap-2 px-1 leading-tight"
          [class]="collapsed() ? 'lg:hidden' : ''"
        >
          <img src="logo.svg" alt="" width="28" height="36" class="h-9 w-auto shrink-0" />
          <span class="min-w-0">
            <span class="block text-lg font-semibold text-amber-900">Dimmelo</span>
            <span class="block truncate text-xs text-stone-500">Database Palio di Siena</span>
          </span>
        </a>
        <button
          type="button"
          class="ml-auto hidden rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 lg:block"
          [class]="collapsed() ? 'lg:mx-auto' : ''"
          [attr.aria-label]="collapsed() ? 'Espandi il menu' : 'Riduci il menu'"
          [attr.aria-expanded]="!collapsed()"
          [title]="collapsed() ? 'Espandi il menu' : 'Riduci il menu'"
          (click)="toggleCollapsed()"
        >
          <app-icon [paths]="icons.panel" class="size-5" />
        </button>
        <button
          type="button"
          class="ml-auto rounded-md p-1.5 text-stone-500 hover:bg-stone-100 lg:hidden"
          aria-label="Chiudi il menu"
          (click)="mobileOpen.set(false)"
        >
          <app-icon [paths]="icons.close" class="size-5" />
        </button>
      </div>

      <nav class="flex-1 space-y-1 overflow-y-auto p-3">
        @for (item of items(); track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="bg-amber-50 font-medium text-amber-900!"
            [routerLinkActiveOptions]="{ exact: item.path === '/' }"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            [title]="collapsed() ? item.label : ''"
          >
            <app-icon [paths]="item.icon" class="size-5" />
            <span class="truncate" [class]="collapsed() ? 'lg:hidden' : ''">{{ item.label }}</span>
          </a>
        }
      </nav>

      @if (auth.user(); as user) {
        <div
          class="flex items-center gap-3 border-t border-stone-200 p-3"
          [class]="collapsed() ? 'lg:flex-col' : ''"
        >
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-800"
            [title]="user.displayName"
          >
            {{ initials() }}
          </span>
          <div class="min-w-0 flex-1" [class]="collapsed() ? 'lg:hidden' : ''">
            <p class="truncate text-sm font-medium text-stone-800">{{ user.displayName }}</p>
            @if (user.email) {
              <p class="truncate text-xs text-stone-500">{{ user.email }}</p>
            }
          </div>
          <button
            type="button"
            class="rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
            aria-label="Esci"
            title="Esci"
            (click)="auth.logout()"
          >
            <app-icon [paths]="icons.logout" class="size-5" />
          </button>
        </div>
      }
    </aside>

    <div
      class="flex h-full flex-col transition-[padding] duration-200"
      [class]="collapsed() ? 'lg:pl-18' : 'lg:pl-64'"
    >
      <header
        class="flex h-14 shrink-0 items-center gap-3 border-b border-stone-200/80 bg-white/80 px-4 backdrop-blur lg:hidden"
      >
        <button
          type="button"
          class="-ml-1 rounded-md p-1.5 text-stone-600 hover:bg-stone-100"
          aria-label="Apri il menu"
          aria-controls="sidebar"
          [attr.aria-expanded]="mobileOpen()"
          (click)="mobileOpen.set(true)"
        >
          <app-icon [paths]="icons.menu" class="size-6" />
        </button>
        <a routerLink="/" class="flex items-center gap-2 text-lg font-semibold text-amber-900">
          <img src="logo.svg" alt="" width="22" height="28" class="h-7 w-auto" />
          Dimmelo
        </a>
      </header>
      <main class="min-h-0 flex-1 overflow-y-auto">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AppShell {
  protected readonly auth = inject(AuthService);
  protected readonly icons = ICONS;

  /** Desktop: sidebar ridotta alle icone. */
  readonly collapsed = signal(readCollapsed());
  /** Mobile: sidebar aperta sopra il contenuto. */
  readonly mobileOpen = signal(false);

  protected readonly items = computed(() =>
    NAV_ITEMS.filter((item) => !item.permission || this.auth.can(item.permission)),
  );

  protected readonly initials = computed(() =>
    (this.auth.user()?.displayName ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join(''),
  );

  protected readonly asideClass = computed(() =>
    [
      'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-stone-200 bg-white',
      'transition-[width,translate] duration-200 lg:translate-x-0',
      this.mobileOpen() ? 'translate-x-0 shadow-xl' : '-translate-x-full',
      this.collapsed() ? 'lg:w-18' : 'lg:w-64',
    ].join(' '),
  );

  constructor() {
    // su mobile la sidebar si chiude appena si sceglie una voce
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.mobileOpen.set(false));
  }

  toggleCollapsed(): void {
    this.collapsed.update((value) => !value);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(this.collapsed()));
    } catch {
      // storage non disponibile: la scelta vale solo per questa pagina
    }
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}
