import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { fantinoFullName, fantinoName, PaliiApi, type PaliiQuery } from '../../core/api/palii-api';
import { BUTTON_SECONDARY } from '../../core/layout/buttons';
import { Icon, ICONS } from '../../core/layout/icon';

const FIELD =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/20';

/**
 * Archivio dei Palii: elenco filtrabile, dal più recente. I filtri stanno nella query string,
 * così il link si condivide e tornando dalla scheda di un Palio si ritrova lo stesso elenco.
 */
@Component({
  selector: 'app-palii-list',
  imports: [DatePipe, RouterLink, Icon],
  template: `
    <section class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-stone-900">Palii</h1>
        <p class="mt-1 text-sm text-stone-600">
          L'archivio dei Palii: vincitrici, fantini, cavalli, estrazioni, tratta e prove.
        </p>
      </div>

      <form
        class="mt-6 grid gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.3fr_1.3fr]"
        (submit)="$event.preventDefault()"
        role="search"
      >
        <label class="relative block sm:col-span-2 lg:col-span-1">
          <span class="sr-only">Cerca fantino o cavallo</span>
          <app-icon [paths]="icons.search" class="absolute top-2.5 left-3 size-4 text-stone-400" />
          <input
            type="search"
            [class]="field + ' pl-9'"
            placeholder="Fantino o cavallo"
            [value]="search()"
            (input)="onSearch($any($event.target).value)"
          />
        </label>
        <label class="block">
          <span class="sr-only">Dall'anno</span>
          <input
            type="number"
            inputmode="numeric"
            [class]="field"
            placeholder="Dal {{ filters.value()?.yearMin ?? 'anno' }}"
            [value]="query().annoDa ?? ''"
            [min]="filters.value()?.yearMin ?? 1000"
            [max]="filters.value()?.yearMax ?? 9999"
            (change)="apply({ annoDa: $any($event.target).value })"
          />
        </label>
        <label class="block">
          <span class="sr-only">All'anno</span>
          <input
            type="number"
            inputmode="numeric"
            [class]="field"
            placeholder="Al {{ filters.value()?.yearMax ?? 'anno' }}"
            [value]="query().annoA ?? ''"
            [min]="filters.value()?.yearMin ?? 1000"
            [max]="filters.value()?.yearMax ?? 9999"
            (change)="apply({ annoA: $any($event.target).value })"
          />
        </label>
        <label class="block">
          <span class="sr-only">Contrada vincitrice</span>
          <select
            [class]="field"
            [value]="query().vincitrice ?? ''"
            (change)="apply({ vincitrice: $any($event.target).value })"
          >
            <option value="">Tutte le vincitrici</option>
            @for (c of filters.value()?.contrade ?? []; track c.id) {
              <option [value]="c.id" [selected]="query().vincitrice === '' + c.id">{{ c.name }}</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="sr-only">Tipo di Palio</span>
          <select [class]="field" (change)="apply({ tipo: $any($event.target).value })">
            <option value="" [selected]="!query().tipo">Ordinari e straordinari</option>
            <option value="ordinari" [selected]="query().tipo === 'ordinari'">Solo ordinari</option>
            <option value="straordinari" [selected]="query().tipo === 'straordinari'">
              Solo straordinari
            </option>
          </select>
        </label>
      </form>

      <div class="mt-4 flex min-h-8 flex-wrap items-center justify-between gap-2 text-sm text-stone-600">
        <span>
          @if (palii.hasValue()) {
            {{ total() === 1 ? '1 Palio' : total() + ' Palii' }}
          }
        </span>
        @if (hasFilters()) {
          <button type="button" class="text-amber-800 hover:underline" (click)="reset()">
            Azzera i filtri
          </button>
        }
      </div>

      @if (palii.error()) {
        <p class="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {{ errorMessage() }}
        </p>
      } @else if (palii.isLoading() && !palii.hasValue()) {
        <p class="mt-6 text-stone-500">Caricamento…</p>
      } @else if (total() === 0) {
        <p class="mt-6 rounded-xl border border-dashed border-stone-300 p-8 text-center text-stone-500">
          Nessun Palio con questi filtri.
        </p>
      } @else {
        <div
          class="mt-2 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
          [class.opacity-60]="palii.isLoading()"
        >
          <div
            class="hidden grid-cols-[9rem_1.4fr_1fr_1fr_1fr] gap-4 border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs font-medium tracking-wide text-stone-500 uppercase md:grid"
            aria-hidden="true"
          >
            <span>Data</span><span>Palio</span><span>Vincitrice</span><span>Fantino</span><span>Cavallo</span>
          </div>
          <ul class="divide-y divide-stone-200">
            @for (p of palii.value()?.items ?? []; track p.id) {
              <li>
                <a
                  [routerLink]="[p.id]"
                  class="grid grid-cols-2 gap-x-4 gap-y-1 px-4 py-3 hover:bg-amber-50/60 md:grid-cols-[9rem_1.4fr_1fr_1fr_1fr] md:items-center"
                >
                  <span class="text-sm text-stone-500 tabular-nums md:text-stone-700">
                    {{ p.date | date: 'd MMM y' : 'UTC' }}
                  </span>
                  <span class="text-right text-sm md:text-left">
                    <span class="font-medium text-stone-900">{{ p.name }}</span>
                  </span>
                  @if (p.winner; as w) {
                    <span class="col-span-2 text-base font-semibold text-amber-900 md:col-span-1 md:text-sm">
                      {{ w.contrada }}
                    </span>
                    <span class="text-sm text-stone-700" [title]="fullName(w.fantino)">
                      <span class="text-stone-400 md:hidden">Fantino </span>{{ name(w.fantino) || '—' }}
                    </span>
                    <span class="text-right text-sm text-stone-700 md:text-left">
                      <span class="text-stone-400 md:hidden">Cavallo </span>{{ w.cavallo || '—' }}
                    </span>
                  } @else {
                    <span class="col-span-2 text-sm text-stone-400 italic md:col-span-3">
                      Nessuna vincitrice
                    </span>
                  }
                </a>
              </li>
            }
          </ul>
        </div>

        @if (pages() > 1) {
          <nav class="mt-4 flex items-center justify-between gap-2" aria-label="Pagine">
            <button type="button" [class]="secondary" [disabled]="page() <= 1" (click)="goToPage(page() - 1)">
              <app-icon [paths]="icons.chevronLeft" class="mr-1 size-4" /> Più recenti
            </button>
            <span class="text-sm text-stone-600">Pagina {{ page() }} di {{ pages() }}</span>
            <button
              type="button"
              [class]="secondary"
              [disabled]="page() >= pages()"
              (click)="goToPage(page() + 1)"
            >
              Meno recenti <app-icon [paths]="icons.chevronRight" class="ml-1 size-4" />
            </button>
          </nav>
        }
      }
    </section>
  `,
})
export class PaliiList {
  private readonly api = inject(PaliiApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly field = FIELD;
  protected readonly secondary = BUTTON_SECONDARY;
  protected readonly icons = ICONS;
  protected readonly name = fantinoName;
  protected readonly fullName = fantinoFullName;

  protected readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map(
        (params): PaliiQuery => ({
          annoDa: params.get('annoDa') ?? undefined,
          annoA: params.get('annoA') ?? undefined,
          vincitrice: params.get('vincitrice') ?? undefined,
          tipo: params.get('tipo') ?? undefined,
          q: params.get('q') ?? undefined,
          pagina: params.get('pagina') ?? undefined,
        }),
      ),
    ),
    { initialValue: {} as PaliiQuery },
  );

  protected readonly palii = this.api.list(this.query);
  protected readonly filters = this.api.filters();

  /** Testo nella casella di ricerca (la query string si aggiorna dopo una pausa). */
  protected readonly search = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly total = computed(() => this.palii.value()?.total ?? 0);
  protected readonly page = computed(() => this.palii.value()?.page ?? 1);
  protected readonly pages = computed(() => {
    const value = this.palii.value();
    return value ? Math.max(1, Math.ceil(value.total / value.pageSize)) : 1;
  });
  protected readonly hasFilters = computed(() => {
    const { pagina: _page, ...filters } = this.query();
    return Object.values(filters).some((v) => v !== undefined && v !== '');
  });
  protected readonly errorMessage = computed(() => {
    const error = this.palii.error() as { error?: { message?: string } } | undefined;
    return error?.error?.message ?? 'Impossibile caricare i Palii.';
  });

  constructor() {
    // la casella segue la query string (link condiviso, indietro del browser)
    effect(() => {
      this.search.set(this.query().q ?? '');
      this.api.listUrl.set(this.router.url);
    });
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.apply({ q: value.trim() }), 300);
  }

  /** Cambia uno o più filtri e torna alla prima pagina. */
  protected apply(change: PaliiQuery): void {
    this.navigate({ ...change, pagina: undefined });
  }

  protected goToPage(page: number): void {
    this.navigate({ pagina: page > 1 ? String(page) : undefined });
    globalThis.scrollTo?.({ top: 0 });
  }

  protected reset(): void {
    clearTimeout(this.searchTimer);
    this.search.set('');
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  private navigate(change: PaliiQuery): void {
    const queryParams = Object.fromEntries(
      Object.entries(change).map(([key, value]) => [key, value === '' ? null : (value ?? null)]),
    );
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }
}
