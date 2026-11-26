import { Component, computed, input, output, signal } from '@angular/core';
import type { InviteDto } from '../../core/auth/dto';

/** Link per creare la passkey, da copiare o condividere con l'utente. */
@Component({
  selector: 'app-invite-panel',
  template: `
    <div class="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="font-semibold text-amber-900">Link d'invito per {{ name() }}</h2>
          <p class="mt-1 text-sm text-amber-800">
            Mandalo a {{ name() }}: aprendolo registra la sua passkey (Face ID, Touch ID o
            chiavetta) e poi entra in Dimmelo. Vale una sola volta e scade presto: se non lo usa
            subito, generane uno nuovo.
          </p>
          <p class="mt-1 text-sm text-amber-800">
            Se usa Google con questa stessa email, può anche entrare direttamente con Google.
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-md px-2 py-1 text-sm text-amber-800 hover:bg-amber-100"
          (click)="closed.emit()"
          aria-label="Chiudi"
        >
          ✕
        </button>
      </div>
      <div class="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          readonly
          [value]="invite().url"
          class="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-stone-700"
          (focus)="$any($event.target).select()"
        />
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
            (click)="copy()"
          >
            {{ copied() ? 'Copiato!' : 'Copia' }}
          </button>
          @if (canShare) {
            <button
              type="button"
              class="flex-1 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
              (click)="share()"
            >
              Condividi
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class InvitePanel {
  readonly invite = input.required<InviteDto>();
  readonly name = input.required<string>();
  readonly closed = output<void>();

  protected readonly copied = signal(false);
  protected readonly canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  private readonly message = computed(
    () =>
      `Ciao ${this.name()}, ecco il tuo link per creare la passkey ed entrare in Dimmelo: ${this.invite().url}`,
  );

  protected async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.invite().url);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  protected async share(): Promise<void> {
    try {
      await navigator.share({ title: 'Invito a Dimmelo', text: this.message() });
    } catch {
      // condivisione annullata dall'utente
    }
  }
}
