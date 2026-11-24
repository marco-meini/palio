import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  CurrentUserDto,
  InviteStatusDto,
  PasskeyRegistrationFinishDto,
  PasskeyRegistrationStartResponseDto,
} from '../../core/auth/dto';

/** Link d'accesso (invito o recupero): pubblici, protetti dal token del link. */
@Injectable({ providedIn: 'root' })
export class InvitesApi {
  private readonly http = inject(HttpClient);

  status(token: string): Promise<InviteStatusDto> {
    return firstValueFrom(this.http.get<InviteStatusDto>(this.path(token)));
  }

  startPasskey(token: string): Promise<PasskeyRegistrationStartResponseDto> {
    return firstValueFrom(
      this.http.post<PasskeyRegistrationStartResponseDto>(
        `${this.path(token)}/passkey/start`,
        null,
      ),
    );
  }

  /** Passkey creata: il backend la registra, consuma il link e apre la sessione. */
  finishPasskey(token: string, body: PasskeyRegistrationFinishDto): Promise<CurrentUserDto> {
    return firstValueFrom(
      this.http.post<CurrentUserDto>(`${this.path(token)}/passkey/finish`, body),
    );
  }

  private path(token: string): string {
    return `/api/invites/${encodeURIComponent(token)}`;
  }
}
