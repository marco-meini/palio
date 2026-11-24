import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Se una chiamata API risponde 401 (sessione scaduta), torna alla pagina di accesso. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((error: unknown) => {
      const isMe = req.url.endsWith('/api/auth/me');
      if (error instanceof HttpErrorResponse && error.status === 401 && !isMe) {
        auth.sessionExpired();
      }
      return throwError(() => error);
    }),
  );
};
