export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  streaming?: boolean;
}

export interface ChatStreamCallbacks {
  /** Conversazione in cui è salvata la domanda (nuova o esistente), appena il server la conosce. */
  onConversation?: (id: number) => void;
  /** Titolo generato dall'AI (solo per una conversazione nuova). */
  onTitle?: (title: string) => void;
  onTextDelta?: (delta: string) => void;
  onToolStart?: (name: string) => void;
  onToolEnd?: (name: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

export interface SendChatOptions extends ChatStreamCallbacks {
  signal?: AbortSignal;
  onUnauthorized?: () => void;
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block.split('\n');
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

export class ChatApiService {
  /**
   * Manda una domanda: la storia della conversazione la tiene il server. Senza
   * `conversationId` il server crea una conversazione nuova (vedi `onConversation`).
   */
  async sendMessage(
    conversationId: number | null,
    message: string,
    options: SendChatOptions = {},
  ): Promise<void> {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, message }),
      signal: options.signal,
      credentials: 'include',
    });

    if (response.status === 401) {
      const message = 'Sessione scaduta. Accedi di nuovo per continuare.';
      options.onUnauthorized?.();
      options.onError?.(message);
      throw new Error(message);
    }

    if (!response.ok) {
      let message = `Errore HTTP ${response.status}`;
      try {
        const json = (await response.json()) as { error?: string; message?: string };
        if (json.error || json.message) message = (json.error ?? json.message)!;
      } catch {
        // ignore
      }
      options.onError?.(message);
      throw new Error(message);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const message = 'Stream non disponibile';
      options.onError?.(message);
      throw new Error(message);
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const parsed = parseSseBlock(trimmed);
        if (!parsed) continue;

        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(parsed.data) as Record<string, unknown>;
        } catch {
          payload = { raw: parsed.data };
        }

        switch (parsed.event) {
          case 'conversation':
            if (typeof payload['id'] === 'number') options.onConversation?.(payload['id']);
            break;
          case 'title':
            if (typeof payload['title'] === 'string') options.onTitle?.(payload['title']);
            break;
          case 'text': {
            const delta = typeof payload['delta'] === 'string' ? payload['delta'] : '';
            if (delta) options.onTextDelta?.(delta);
            break;
          }
          case 'tool_start':
            if (typeof payload['name'] === 'string') options.onToolStart?.(payload['name']);
            break;
          case 'tool_end':
            if (typeof payload['name'] === 'string') options.onToolEnd?.(payload['name']);
            break;
          case 'error': {
            const message =
              typeof payload['message'] === 'string' ? payload['message'] : 'Errore sconosciuto';
            options.onError?.(message);
            break;
          }
          case 'done':
            options.onDone?.();
            break;
        }
      }
    }

    options.onDone?.();
  }

  async health(): Promise<{ ok: boolean; db?: string; error?: string }> {
    const response = await fetch('/api/health');
    return (await response.json()) as { ok: boolean; db?: string; error?: string };
  }
}
