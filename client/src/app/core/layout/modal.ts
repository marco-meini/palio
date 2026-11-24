import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
} from '@angular/core';

let nextId = 0;

/**
 * Finestra modale: il genitore la mostra con `@if` e la chiude su `(closed)`.
 * Si chiude con Esc, con la ✕ o cliccando fuori; all'apertura il fuoco va sul primo campo.
 * I pulsanti vanno nel footer: un elemento con l'attributo `modal-footer`
 * (di solito `<app-modal-actions modal-footer …>`).
 */
@Component({
  selector: 'app-modal',
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div
      class="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 sm:items-center sm:p-4"
      (click)="closed.emit()"
    >
      <div
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        class="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        [class]="wide() ? 'sm:max-w-2xl' : 'sm:max-w-lg'"
        (click)="$event.stopPropagation()"
      >
        <div class="mb-4 flex items-start justify-between gap-4">
          <h2 [id]="titleId" class="text-lg font-medium text-stone-900">{{ title() }}</h2>
          <button
            type="button"
            class="-m-1 rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
            aria-label="Chiudi"
            (click)="closed.emit()"
          >
            ✕
          </button>
        </div>
        <ng-content />
        <!-- footer: pulsanti (di solito <app-modal-actions modal-footer>), sempre visibili -->
        <div
          class="sticky bottom-0 -mx-5 mt-6 -mb-5 border-t border-stone-100 bg-white px-5 py-4 empty:hidden"
        >
          <ng-content select="[modal-footer]" />
        </div>
      </div>
    </div>
  `,
})
export class Modal implements OnDestroy {
  readonly title = input.required<string>();
  /** Più larga, per moduli con molti campi. */
  readonly wide = input(false);
  readonly closed = output<void>();

  protected readonly titleId = `modal-title-${++nextId}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly previousFocus = document.activeElement as HTMLElement | null;

  constructor() {
    document.body.classList.add('overflow-hidden');
    afterNextRender(() => {
      const first = this.host.nativeElement.querySelector<HTMLElement>(
        '[role=dialog] input:not([type=hidden]):not([type=checkbox]), [role=dialog] select, [role=dialog] textarea',
      );
      first?.focus();
    });
  }

  ngOnDestroy(): void {
    document.body.classList.remove('overflow-hidden');
    this.previousFocus?.focus?.();
  }
}
