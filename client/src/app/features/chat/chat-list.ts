import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type ChatSummaryDto, ChatsApi } from '../../core/api/chats-api';
import { toApiError } from '../../core/api/users-api';
import { BUTTON_DANGER_CONFIRM, BUTTON_SECONDARY } from '../../core/layout/buttons';
import { Modal } from '../../core/layout/modal';

/** Elenco delle ultime chat dell'utente: si riapre una chat o se ne inizia una nuova. */
@Component({
  selector: 'app-chat-list',
  imports: [RouterLink, DatePipe, Modal],
  template: `
    <section class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-stone-900">Chat</h1>
          <p class="mt-1 text-sm text-stone-600">Le tue conversazioni con Dimmelo sul Palio.</p>
        </div>
        <a
          routerLink="nuova"
          class="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-800"
        >
          Nuova chat
        </a>
      </div>

      @if (chats.isLoading() && !chats.hasValue()) {
        <p class="mt-8 text-stone-500">Caricamento…</p>
      } @else if (chats.error()) {
        <p class="mt-8 text-red-700">Impossibile caricare le chat.</p>
      } @else {
        <ul
          class="mt-6 divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
        >
          @for (chat of chats.value() ?? []; track chat.id) {
            <li class="flex items-center gap-3 hover:bg-stone-50">
              <a [routerLink]="[chat.id]" class="min-w-0 flex-1 px-4 py-3">
                <span class="block truncate font-medium text-stone-900">
                  {{ chat.title ?? 'Nuova chat' }}
                </span>
                <span class="block text-xs text-stone-500">
                  {{ chat.updatedAt | date: 'd MMM y, HH:mm' }}
                </span>
              </a>
              <button
                type="button"
                class="mr-3 rounded-md px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                [attr.aria-label]="'Elimina ' + (chat.title ?? 'chat')"
                (click)="askDelete(chat)"
              >
                Elimina
              </button>
            </li>
          } @empty {
            <li class="p-6 text-center text-stone-500">
              Nessuna chat. Inizia con
              <a routerLink="nuova" class="font-medium text-amber-700 hover:text-amber-900"
                >una nuova chat</a
              >.
            </li>
          }
        </ul>
      }

      @if (deleting(); as chat) {
        <app-modal title="Eliminare la chat?" (closed)="deleting.set(null)">
          <p class="text-sm text-stone-700">
            <strong class="text-stone-900">{{ chat.title ?? 'Nuova chat' }}</strong> e tutti i suoi
            messaggi verranno eliminati. Non si può annullare.
          </p>
          @if (deleteError()) {
            <p class="mt-3 text-sm text-red-700" role="alert">{{ deleteError() }}</p>
          }
          <div modal-footer class="flex flex-wrap justify-end gap-2">
            <button type="button" [class]="secondary" (click)="deleting.set(null)">Annulla</button>
            <button type="button" [class]="dangerConfirm" [disabled]="busy()" (click)="remove(chat)">
              Sì, elimina
            </button>
          </div>
        </app-modal>
      }
    </section>
  `,
})
export class ChatList {
  protected readonly secondary = BUTTON_SECONDARY;
  protected readonly dangerConfirm = BUTTON_DANGER_CONFIRM;
  private readonly api = inject(ChatsApi);
  protected readonly chats = this.api.list();

  protected readonly deleting = signal<ChatSummaryDto | null>(null);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected askDelete(chat: ChatSummaryDto): void {
    this.deleteError.set(null);
    this.deleting.set(chat);
  }

  protected async remove(chat: ChatSummaryDto): Promise<void> {
    this.busy.set(true);
    this.deleteError.set(null);
    try {
      await this.api.remove(chat.id);
      this.deleting.set(null);
      this.chats.reload();
    } catch (error) {
      this.deleteError.set(toApiError(error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
