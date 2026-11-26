import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ChatsApi } from '../../core/api/chats-api';
import { toApiError } from '../../core/api/users-api';
import { AuthService } from '../../core/auth/auth.service';
import {
  ChatApiService,
  ChatMessage,
} from '../../core/services/chat-api.service';
import { renderMarkdown } from '../../core/utils/markdown';

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: `Ciao! Sono Dimmelo: interrogo il database del Palio di Siena per rispondere su edizioni, contrade, cavalli e risultati.

Esempi di domande:
- *Quali cavalli hanno corso in due palii consecutivi in anni diversi?*
- *Quante vittorie ha l'Aquila negli anni '90?*
- *Chi ha vinto il Palio del 2 luglio 2025 e con quale fantino?*
- *Elenca le edizioni straordinarie dal 2000.*

Scrivi pure la tua domanda qui sotto.`,
};

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="flex h-full flex-col">
      <header
        class="flex items-center gap-3 border-b border-stone-200/80 bg-white/70 px-4 py-3 backdrop-blur sm:px-6"
      >
        <a
          routerLink="/chat"
          class="shrink-0 rounded-md px-2 py-1 text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          >← Chat</a
        >
        <h1 class="min-w-0 truncate text-base font-semibold text-stone-900">
          {{ title() ?? 'Nuova chat' }}
        </h1>
      </header>

      <div
        #scrollContainer
        class="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
        role="log"
        aria-live="polite"
      >
        <div class="mx-auto flex max-w-3xl flex-col gap-4">
          @for (message of messages(); track message.id) {
            <article
              class="flex gap-3"
              [class.flex-row-reverse]="message.role === 'user'"
            >
              <div
                class="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                [class.bg-amber-700]="message.role === 'assistant'"
                [class.bg-stone-800]="message.role === 'user'"
                aria-hidden="true"
              >
                {{ message.role === 'assistant' ? 'AI' : 'Tu' }}
              </div>

              <div
                class="max-w-[85%] rounded-2xl px-4 py-3 shadow-sm"
                [class.bg-white]="message.role === 'assistant'"
                [class.border]="message.role === 'assistant'"
                [class.border-stone-200]="message.role === 'assistant'"
                [class.bg-stone-800]="message.role === 'user'"
                [class.text-white]="message.role === 'user'"
              >
                @if (message.role === 'assistant') {
                  <div
                    class="prose-chat text-stone-800"
                    [innerHTML]="render(message.content)"
                  ></div>
                } @else {
                  <p class="whitespace-pre-wrap text-sm leading-relaxed">{{ message.content }}</p>
                }
              </div>
            </article>
          }

          @if (loading()) {
            <article class="flex gap-3" aria-busy="true" aria-live="polite">
              <div
                class="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-700 text-xs font-semibold text-white"
                aria-hidden="true"
              >
                AI
              </div>
              <div
                class="flex max-w-[85%] items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm"
                role="status"
              >
                <span
                  class="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-amber-200 border-t-amber-700"
                  aria-hidden="true"
                ></span>
                <p class="text-sm text-stone-600">Sto elaborando la richiesta…</p>
              </div>
            </article>
          }

          @if (error()) {
            <div
              class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {{ error() }}
            </div>
          }
        </div>
      </div>

      <footer class="border-t border-stone-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
        <form
          class="mx-auto flex max-w-3xl items-end gap-2"
          (ngSubmit)="submit()"
        >
          <label class="sr-only" for="chat-input">Messaggio</label>
          <textarea
            id="chat-input"
            rows="1"
            class="min-h-[48px] flex-1 resize-none rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm shadow-sm outline-none ring-amber-600/30 transition focus:border-amber-500 focus:ring-2 disabled:opacity-60"
            placeholder="Chiedi qualcosa sul Palio…"
            [(ngModel)]="draft"
            name="draft"
            [disabled]="loading()"
            (keydown.enter)="onEnter($event)"
          ></textarea>
          <button
            type="submit"
            class="rounded-2xl bg-amber-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
            [disabled]="loading() || !draft.trim()"
          >
            Invia
          </button>
        </form>
      </footer>
    </div>
  `,
})
export class ChatComponent implements OnDestroy {
  /** Path param `:id`: id della chat salvata, o `nuova`. */
  readonly id = input<string>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly chats = inject(ChatsApi);
  private readonly chatApi = new ChatApiService();
  /** Chat mostrata (`null` = nuova, non ancora salvata). */
  private readonly conversationId = signal<number | null>(null);
  protected readonly title = signal<string | null>(null);

  private abortController: AbortController | null = null;

  protected readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');

  protected draft = '';
  protected readonly messages = signal<ChatMessage[]>([WELCOME]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canSend = computed(
    () => !this.loading() && this.draft.trim().length > 0,
  );

  constructor() {
    effect(() => {
      const raw = this.id();
      untracked(() => {
        const id = raw && raw !== 'nuova' ? Number(raw) : null;
        // la chat appena creata da questa pagina è già mostrata: niente da ricaricare
        if (id !== null && id === this.conversationId()) return;
        void this.open(id);
      });
    });
  }

  ngOnDestroy(): void {
    this.abortController?.abort();
  }

  /** Mostra una chat salvata, o una nuova vuota. */
  private async open(id: number | null): Promise<void> {
    this.abortController?.abort();
    this.conversationId.set(id);
    this.title.set(null);
    this.error.set(null);
    this.loading.set(false);
    this.messages.set(id === null ? [WELCOME] : []);
    if (id === null || Number.isNaN(id)) {
      if (Number.isNaN(id)) this.error.set('Chat non trovata');
      return;
    }
    try {
      const chat = await this.chats.get(id);
      if (this.conversationId() !== id) return;
      this.title.set(chat.title);
      this.messages.set(
        chat.messages.map((m) => ({ id: String(m.id), role: m.role, content: m.content })),
      );
      this.scrollToBottom();
    } catch (error) {
      if (this.conversationId() === id) this.error.set(toApiError(error).message);
    }
  }

  protected render(content: string): string {
    return renderMarkdown(content);
  }

  protected onEnter(event: Event): void {
    const ke = event as KeyboardEvent;
    if (ke.shiftKey) return;
    ke.preventDefault();
    this.submit();
  }

  protected async submit(): Promise<void> {
    const text = this.draft.trim();
    if (!text || this.loading()) return;

    this.error.set(null);
    this.draft = '';

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    };

    this.messages.update((list) => [...list, userMessage]);
    this.loading.set(true);
    this.scrollToBottom();

    this.abortController?.abort();
    this.abortController = new AbortController();

    let assistantId: string | null = null;

    try {
      await this.chatApi.sendMessage(this.conversationId(), text, {
        signal: this.abortController.signal,
        onConversation: (id) => {
          if (this.conversationId() === id) return;
          // chat appena creata: l'indirizzo diventa quello della chat salvata
          this.conversationId.set(id);
          void this.router.navigate(['/chat', id], { replaceUrl: true });
        },
        onTitle: (title) => this.title.set(title),
        onTextDelta: (delta) => {
          if (!assistantId) {
            assistantId = crypto.randomUUID();
            const id = assistantId;
            this.messages.update((list) => [
              ...list,
              {
                id,
                role: 'assistant',
                content: delta,
                streaming: true,
              },
            ]);
            this.loading.set(false);
            this.scrollToBottom();
            return;
          }
          const id = assistantId;
          this.messages.update((list) =>
            list.map((m) =>
              m.id === id ? { ...m, content: m.content + delta } : m,
            ),
          );
          this.scrollToBottom();
        },
        onDone: () => {
          if (!assistantId) return;
          const id = assistantId;
          this.messages.update((list) =>
            list.map((m) =>
              m.id === id ? { ...m, streaming: false } : m,
            ),
          );
        },
        onError: (message) => this.error.set(message),
        onUnauthorized: () => this.auth.sessionExpired(),
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        const message = err instanceof Error ? err.message : 'Invio fallito';
        this.error.set(message);
      }
    } finally {
      this.loading.set(false);
      this.scrollToBottom();
    }
  }

  private scrollToBottom(): void {
    queueMicrotask(() => {
      const el = this.scrollContainer()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
