import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  CreateUserDto,
  CreateUserResponseDto,
  InviteDto,
  PermissionSectionDto,
  UpdateUserDto,
  UserDto,
} from '../../core/auth/dto';

/** Utenti con accesso a Dimmelo e loro permessi (`users.view` / `users.manage`). */
@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  list() {
    return httpResource<UserDto[]>(() => '/api/users');
  }

  get(id: string): Promise<UserDto> {
    return firstValueFrom(this.http.get<UserDto>(`/api/users/${id}`));
  }

  create(user: CreateUserDto): Promise<CreateUserResponseDto> {
    return firstValueFrom(this.http.post<CreateUserResponseDto>('/api/users', user));
  }

  update(id: string, user: UpdateUserDto): Promise<UserDto> {
    return firstValueFrom(this.http.put<UserDto>(`/api/users/${id}`, user));
  }

  invite(id: string): Promise<InviteDto> {
    return firstValueFrom(this.http.post<InviteDto>(`/api/users/${id}/invite`, null));
  }

  disable(id: string): Promise<UserDto> {
    return firstValueFrom(this.http.post<UserDto>(`/api/users/${id}/disable`, null));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/users/${id}`));
  }

  enable(id: string): Promise<UserDto> {
    return firstValueFrom(this.http.post<UserDto>(`/api/users/${id}/enable`, null));
  }

  /** Catalogo dei permessi, raggruppati per sezione. */
  permissionCatalog(): Promise<PermissionSectionDto[]> {
    return firstValueFrom(this.http.get<PermissionSectionDto[]>('/api/permissions'));
  }
}

/** Errore dell'API in forma leggibile: messaggio ed eventuali errori per campo. */
export interface ApiError {
  message: string;
  fields: Record<string, string>;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { message?: unknown; errors?: Record<string, string> } | null;
    const message = typeof body?.message === 'string' ? body.message : null;
    if (error.status === 0) return { message: 'Server non raggiungibile', fields: {} };
    return { message: message ?? `Errore ${error.status}`, fields: body?.errors ?? {} };
  }
  return { message: 'Errore imprevisto', fields: {} };
}
