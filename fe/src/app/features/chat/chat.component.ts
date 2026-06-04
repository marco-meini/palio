import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
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
  imports: [FormsModule],
  template: `
    <div class="flex h-full min-h-screen flex-col bg-gradient-to-b from-amber-50/80 to-stone-100">
      <header
        class="border-b border-stone-200/80 bg-white/80 px-4 py-4 backdrop-blur sm:px-6"
      >
        <div class="mx-auto max-w-3xl">
          <h1 class="text-lg font-semibold text-stone-900">Dimmelo</h1>
          @if (displayName()) {
            <p class="text-sm text-stone-600">Ciao, {{ displayName() }}</p>
          }
          <p class="text-sm text-stone-500">Database Palio di Siena</p>
        </div>
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
  private readonly auth = inject(AuthService);
  private readonly chatApi = new ChatApiService();
  private readonly router = inject(Router);

  protected readonly displayName = this.auth.displayName;
  private abortController: AbortController | null = null;

  protected readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');

  protected draft = '';
  protected readonly messages = signal<ChatMessage[]>([WELCOME]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canSend = computed(
    () => !this.loading() && this.draft.trim().length > 0,
  );

  ngOnDestroy(): void {
    this.abortController?.abort();
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

    const history = this.messages()
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, content: m.content }));

    let reply = '';

    try {
      await this.chatApi.sendMessage(history, {
        signal: this.abortController.signal,
        onTextDelta: (delta) => {
          reply += delta;
        },
        onError: (message) => this.error.set(message),
        onUnauthorized: () => {
          void this.router.navigate(['/login']);
        },
      });

      if (reply.trim()) {
        this.messages.update((list) => [
          ...list,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: reply,
          },
        ]);
      }
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
