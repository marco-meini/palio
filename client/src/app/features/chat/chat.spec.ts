import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { ChatComponent } from './chat.component';
import { ChatList } from './chat-list';

const settle = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  await fixture.whenStable();
  fixture.detectChanges();
};

/** Risposta SSE come quella di `POST /api/chat`. */
function sse(events: [string, unknown][]): Response {
  const body = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('Chat salvate', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('elenco: titoli (o «Nuova chat»), link alla chat ed eliminazione confermata', async () => {
    const fixture = TestBed.createComponent(ChatList);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/chats').flush([
      { id: 7, title: 'Vittorie dell’Aquila', updatedAt: '2026-11-26T10:00:00Z' },
      { id: 3, title: null, updatedAt: '2026-11-25T10:00:00Z' },
    ]);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Vittorie dell’Aquila');
    expect(root.textContent).toContain('Nuova chat');
    expect(root.querySelector('a[href="/7"]')).not.toBeNull();

    root.querySelector<HTMLButtonElement>('[aria-label="Elimina Vittorie dell’Aquila"]')!.click();
    await settle(fixture);
    http.expectNone({ method: 'DELETE' });
    [...root.querySelectorAll('button')].find((b) => b.textContent!.includes('Sì, elimina'))!.click();
    const req = http.expectOne('/api/chats/7');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await vi.waitFor(() => http.expectOne('/api/chats').flush([]));
    await settle(fixture);
    expect(root.textContent).toContain('Nessuna chat');
  });

  it('chat esistente: carica titolo e messaggi', async () => {
    const fixture = TestBed.createComponent(ChatComponent);
    fixture.componentRef.setInput('id', '5');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/chats/5')
      .flush({
        id: 5,
        title: 'Cavalli consecutivi',
        messages: [
          { id: 1, role: 'user', content: 'Quali cavalli?' },
          { id: 2, role: 'assistant', content: 'Questi cavalli.' },
        ],
      });
    await settle(fixture);
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Cavalli consecutivi');
    expect(text).toContain('Quali cavalli?');
    expect(text).toContain('Questi cavalli.');
    expect(text).not.toContain('Sono Dimmelo');
  });

  it('nuova chat: manda solo la domanda, passa all’indirizzo della chat salvata e mostra il titolo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sse([
        ['conversation', { id: 9 }],
        ['text', { delta: 'Ha vinto ' }],
        ['text', { delta: 'la Torre.' }],
        ['title', { title: 'Vincitore del 2025' }],
        ['done', {}],
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(ChatComponent);
    fixture.componentRef.setInput('id', 'nuova');
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Sono Dimmelo');

    const textarea = root.querySelector('textarea')!;
    textarea.value = 'Chi ha vinto nel 2025?';
    textarea.dispatchEvent(new Event('input'));
    await settle(fixture);
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(root.textContent).toContain('Vincitore del 2025'), { timeout: 2000 });
    await settle(fixture);

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      conversationId: null,
      message: 'Chi ha vinto nel 2025?',
    });
    expect(navigate).toHaveBeenCalledWith(['/chat', 9], { replaceUrl: true });
    expect(root.textContent).toContain('Ha vinto la Torre.');

    // la stessa pagina diventa la chat 9: la domanda successiva continua quella conversazione
    fixture.componentRef.setInput('id', '9');
    await settle(fixture);
    TestBed.inject(HttpTestingController).expectNone('/api/chats/9');
    fetchMock.mockResolvedValue(sse([['conversation', { id: 9 }], ['done', {}]]));
    textarea.value = 'E nel 2024?';
    textarea.dispatchEvent(new Event('input'));
    await settle(fixture);
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ conversationId: 9, message: 'E nel 2024?' });
  });
});
