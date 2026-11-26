import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Contratto con l'API (stessi tipi in `server/src/lib/chat/chat-history.ts`). */
export interface ChatSummaryDto {
  id: number;
  /** `null` finché l'AI non ha generato il titolo. */
  title: string | null;
  /** Ultima attività. */
  updatedAt: string;
}

export interface ChatMessageDto {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatDto {
  id: number;
  title: string | null;
  messages: ChatMessageDto[];
}

/** Chat salvate dell'utente corrente (`chat.use`). La domanda in streaming è in `ChatApiService`. */
@Injectable({ providedIn: 'root' })
export class ChatsApi {
  private readonly http = inject(HttpClient);

  list() {
    return httpResource<ChatSummaryDto[]>(() => '/api/chats');
  }

  get(id: number): Promise<ChatDto> {
    return firstValueFrom(this.http.get<ChatDto>(`/api/chats/${id}`));
  }

  remove(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/chats/${id}`));
  }
}
