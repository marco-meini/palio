import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { RecoveryRequestDto } from '../../core/auth/dto';

/** Recupero dell'accesso (pubblico): manda un link per email se l'indirizzo è censito. */
@Injectable({ providedIn: 'root' })
export class RecoveryApi {
  private readonly http = inject(HttpClient);

  request(body: RecoveryRequestDto): Promise<void> {
    return firstValueFrom(this.http.post<void>('/api/auth/recovery', body));
  }
}
