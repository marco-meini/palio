import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import {
  canapeLabel,
  type FantinoDto,
  fantinoFullName,
  fantinoName,
  PaliiApi,
  type PartecipazioneDto,
} from '../../core/api/palii-api';
import { Icon, ICONS } from '../../core/layout/icon';

type Tab = 'corsa' | 'estrazione' | 'dirigenze' | 'prove';

const TABS: { key: Tab; label: string }[] = [
  { key: 'corsa', label: 'Corsa' },
  { key: 'estrazione', label: 'Estrazione e tratta' },
  { key: 'dirigenze', label: 'Dirigenze' },
  { key: 'prove', label: 'Prove' },
];

/** Ordina per un numero (i mancanti in fondo), poi per contrada. */
function byNumber(value: (p: PartecipazioneDto) => number | null) {
  return (a: PartecipazioneDto, b: PartecipazioneDto) =>
    (value(a) ?? 99) - (value(b) ?? 99) || a.contrada.localeCompare(b.contrada, 'it');
}

const TH = 'px-3 py-2 text-left text-xs font-medium tracking-wide text-stone-500 uppercase';
const TD = 'px-3 py-2 text-sm text-stone-700';

/** Scheda di un Palio: risultato, estrazione e tratta, dirigenze delle contrade, prove. */
@Component({
  selector: 'app-palio-detail',
  imports: [DatePipe, RouterLink, Icon],
  template: `
    <section class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
        <a [routerLink]="listUrl()" class="inline-flex items-center text-amber-800 hover:underline">
          <app-icon [paths]="icons.chevronLeft" class="mr-1 size-4" /> Tutti i Palii
        </a>
        @if (palio.value(); as p) {
          <span class="flex gap-1">
            @if (p.previousId) {
              <a [routerLink]="['/palii', p.previousId]" class="rounded-md px-2 py-1 text-stone-600 hover:bg-stone-100">
                ← Precedente
              </a>
            }
            @if (p.nextId) {
              <a [routerLink]="['/palii', p.nextId]" class="rounded-md px-2 py-1 text-stone-600 hover:bg-stone-100">
                Successivo →
              </a>
            }
          </span>
        }
      </div>

      @if (palio.error()) {
        <p class="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {{ errorMessage() }}
        </p>
      } @else if (!palio.hasValue()) {
        <p class="mt-8 text-stone-500">Caricamento…</p>
      } @else if (palio.value(); as p) {
        <header class="mt-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <p class="text-sm text-stone-500">{{ p.date | date: 'EEEE d MMMM y' : 'UTC' }}</p>
          <h1 class="mt-1 text-2xl font-semibold tracking-tight text-stone-900">{{ p.name }}</h1>
          <dl class="mt-4 grid gap-4 sm:grid-cols-4">
            <div class="sm:col-span-1">
              <dt class="text-xs tracking-wide text-stone-500 uppercase">Vincitrice</dt>
              <dd class="mt-0.5 text-lg font-semibold text-amber-900">{{ p.winner?.contrada ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs tracking-wide text-stone-500 uppercase">Fantino</dt>
              <dd class="mt-0.5 text-stone-800" [title]="fullName(p.winner?.fantino ?? null)">
                {{ name(p.winner?.fantino ?? null) || '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-xs tracking-wide text-stone-500 uppercase">Cavallo</dt>
              <dd class="mt-0.5 text-stone-800">{{ p.winner?.cavallo ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs tracking-wide text-stone-500 uppercase">Drappellone</dt>
              <dd class="mt-0.5 text-stone-800">{{ p.pittore ?? '—' }}</dd>
            </div>
          </dl>
        </header>

        <div class="mt-6 flex gap-1 overflow-x-auto border-b border-stone-200" role="tablist">
          @for (t of tabs(); track t.key) {
            <button
              type="button"
              role="tab"
              class="-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium"
              [class]="activeTab() === t.key ? 'border-amber-700 text-amber-900' : 'border-transparent text-stone-500 hover:text-stone-800'"
              [attr.aria-selected]="activeTab() === t.key"
              (click)="tab.set(t.key)"
            >
              {{ t.label }}
            </button>
          }
        </div>

        <div class="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          @switch (activeTab()) {
            @case ('corsa') {
              <table class="w-full min-w-[40rem]">
                <thead class="border-b border-stone-200 bg-stone-50">
                  <tr>
                    <th [class]="th">Arrivo</th><th [class]="th">Contrada</th><th [class]="th">Canape</th>
                    <th [class]="th">Fantino</th><th [class]="th">Cavallo</th><th [class]="th">Caduta</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-stone-100">
                  @for (c of corsa(); track c.contrada) {
                    <tr [class]="c.vincitrice ? 'bg-amber-50' : c.nonPartecipa ? 'text-stone-400' : ''">
                      <td [class]="td + ' tabular-nums'">{{ c.ordineArrivo ? c.ordineArrivo + '°' : '' }}</td>
                      <td [class]="td">
                        <span [class]="c.vincitrice ? 'font-semibold text-amber-900' : 'font-medium text-stone-900'">
                          {{ c.contrada }}
                        </span>
                        @if (c.vincitrice) {
                          <span class="ml-2 rounded-full bg-amber-700 px-2 py-0.5 text-xs font-medium text-white">Vince</span>
                        }
                        @if (c.nonPartecipa) {
                          <span class="ml-2 text-xs text-stone-500">non corre</span>
                        }
                      </td>
                      <td [class]="td">{{ canape(c.canape) }}</td>
                      <td [class]="td" [title]="fullName(c.fantino)">{{ name(c.fantino) }}</td>
                      <td [class]="td">{{ c.cavallo }}</td>
                      <td [class]="td">{{ c.giroCaduta ? 'Cade al ' + c.giroCaduta + '° giro' : '' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
            @case ('estrazione') {
              <table class="w-full min-w-[44rem]">
                <thead class="border-b border-stone-200 bg-stone-50">
                  <tr>
                    <th [class]="th" title="Ordine di estrazione: posto alle trifore">Trifore</th>
                    <th [class]="th">Contrada</th><th [class]="th">Partecipa</th>
                    <th [class]="th" title="Ordine di assegnazione del cavallo">Assegn.</th>
                    <th [class]="th">Orecchio</th><th [class]="th">Coscia</th>
                    <th [class]="th">Cavallo</th><th [class]="th">Proprietario</th><th [class]="th">Preso da</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-stone-100">
                  @for (c of estrazione(); track c.contrada) {
                    <tr [class.text-stone-400]="c.nonPartecipa">
                      <td [class]="td + ' tabular-nums'">{{ c.ordine }}</td>
                      <td [class]="td + ' font-medium text-stone-900'">{{ c.contrada }}</td>
                      <td [class]="td">{{ entry(c) }}</td>
                      <td [class]="td + ' tabular-nums'">{{ c.ordineAssegnazione }}</td>
                      <td [class]="td + ' tabular-nums'">{{ c.orecchio }}</td>
                      <td [class]="td + ' tabular-nums'">{{ c.coscia }}</td>
                      <td [class]="td">{{ c.cavallo }}</td>
                      <td [class]="td">{{ c.proprietarioCavallo }}</td>
                      <td [class]="td">{{ c.cavalloPresoDa }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
            @case ('dirigenze') {
              <table class="w-full min-w-[40rem]">
                <thead class="border-b border-stone-200 bg-stone-50">
                  <tr>
                    <th [class]="th">Contrada</th><th [class]="th">Capitano</th><th [class]="th">Priore</th>
                    <th [class]="th">Barbaresco</th><th [class]="th">Mangini</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-stone-100">
                  @for (c of alfabetico(); track c.contrada) {
                    <tr>
                      <td [class]="td + ' font-medium text-stone-900'">{{ c.contrada }}</td>
                      <td [class]="td">{{ c.capitano }}</td>
                      <td [class]="td">{{ c.priore }}</td>
                      <td [class]="td">{{ c.barbaresco }}</td>
                      <td [class]="td">{{ c.mangini.join(', ') }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
            @case ('prove') {
              <table class="w-full min-w-[52rem]">
                <thead class="border-b border-stone-200 bg-stone-50">
                  <tr>
                    <th [class]="th">Contrada</th>
                    @for (prova of p.prove; track prova.numero) {
                      <th [class]="th">{{ prova.name }}</th>
                    }
                  </tr>
                </thead>
                <tbody class="divide-y divide-stone-100">
                  @for (row of prove(); track row.contrada) {
                    <tr>
                      <td [class]="td + ' font-medium text-stone-900'">{{ row.contrada }}</td>
                      @for (cell of row.cells; track $index) {
                        <td [class]="td + ' align-top'">
                          @if (cell) {
                            @if (cell.nonPartecipa) {
                              <span class="text-stone-400">N.P.</span>
                            } @else {
                              <span class="block tabular-nums">{{ canape(cell.canape) }}</span>
                              <span
                                class="block text-xs"
                                [class]="cell.changed ? 'font-medium text-amber-800' : 'text-stone-500'"
                                [title]="cell.changed ? 'Fantino diverso da quello del Palio' : fullName(cell.fantino)"
                              >
                                {{ name(cell.fantino) }}
                              </span>
                            }
                          }
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
              <p class="border-t border-stone-100 px-3 py-2 text-xs text-stone-500">
                Posto al canape per ogni prova; in evidenza il fantino quando è diverso da quello del Palio.
              </p>
            }
          }
        </div>
      }
    </section>
  `,
})
export class PalioDetail {
  private readonly api = inject(PaliiApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly icons = ICONS;
  protected readonly th = TH;
  protected readonly td = TD;
  protected readonly name = fantinoName;
  protected readonly fullName = fantinoFullName;
  protected readonly canape = canapeLabel;
  protected readonly listUrl = this.api.listUrl;

  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? undefined)));
  protected readonly palio = this.api.get(this.id);
  protected readonly tab = signal<Tab>('corsa');

  protected readonly tabs = computed(() =>
    TABS.filter((t) => t.key !== 'prove' || (this.palio.value()?.prove.length ?? 0) > 0),
  );
  /** La scheda scelta, se c'è anche in questo Palio (es. senza prove si torna alla corsa). */
  protected readonly activeTab = computed(() =>
    this.tabs().some((t) => t.key === this.tab()) ? this.tab() : 'corsa',
  );

  private readonly contrade = computed(() => this.palio.value()?.contrade ?? []);
  /** Ordine d'arrivo, poi canape; chi non corre in fondo. */
  protected readonly corsa = computed(() =>
    [...this.contrade()].sort(
      (a, b) =>
        Number(a.nonPartecipa) - Number(b.nonPartecipa) ||
        (a.ordineArrivo ?? 99) - (b.ordineArrivo ?? 99) ||
        (a.canape ?? 99) - (b.canape ?? 99) ||
        a.contrada.localeCompare(b.contrada, 'it'),
    ),
  );
  protected readonly estrazione = computed(() => [...this.contrade()].sort(byNumber((c) => c.ordine)));
  protected readonly alfabetico = computed(() =>
    [...this.contrade()].sort((a, b) => a.contrada.localeCompare(b.contrada, 'it')),
  );

  /** Tabella delle prove: una riga per contrada, una colonna per prova. */
  protected readonly prove = computed(() => {
    const palio = this.palio.value();
    if (!palio) return [];
    const fantinoPalio = new Map(palio.contrade.map((c) => [c.contrada, c.fantino?.nome ?? null]));
    const names = new Set(palio.prove.flatMap((p) => p.entries.map((e) => e.contrada)));
    return [...names]
      .sort((a, b) => a.localeCompare(b, 'it'))
      .map((contrada) => ({
        contrada,
        cells: palio.prove.map((prova) => {
          const entry = prova.entries.find((e) => e.contrada === contrada);
          if (!entry) return null;
          const palioRider = fantinoPalio.get(contrada);
          const changed = !!entry.fantino && !!palioRider && entry.fantino.nome !== palioRider;
          return { ...entry, changed } as {
            canape: number | null;
            nonPartecipa: boolean;
            fantino: FantinoDto | null;
            changed: boolean;
          };
        }),
      }));
  });

  protected readonly errorMessage = computed(() => {
    const error = this.palio.error() as { status?: number; error?: { message?: string } } | undefined;
    if (error?.status === 404) return 'Palio non trovato.';
    return error?.error?.message ?? 'Impossibile caricare il Palio.';
  });

  /** Come la contrada è entrata nel Palio. */
  protected entry(c: PartecipazioneDto): string {
    if (!c.estratta) return 'Di diritto';
    if (c.estrattaDa && c.estrattaDa !== c.contrada) return `Estratta da ${c.estrattaDa}`;
    if (c.estrattaDa === c.contrada) return 'Autoestrazione';
    return 'Estratta';
  }
}
