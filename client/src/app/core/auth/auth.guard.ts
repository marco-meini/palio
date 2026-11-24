import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { Permission } from './dto';
import { AuthService } from './auth.service';

/** Rotte riservate agli utenti autenticati: altrimenti si va alla pagina di accesso. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() || auth.loginPage(state.url);
};

/** Pagina di accesso: chi è già autenticato va direttamente a destinazione. */
export const anonymousGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  if (!auth.isAuthenticated()) return true;
  const returnTo = route.queryParamMap.get('returnTo');
  return inject(Router).parseUrl(
    returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/',
  );
};

/** Rotte che richiedono un permesso (es. `permissionGuard('users.view')`). */
export function permissionGuard(permission: Permission): CanActivateFn {
  return (route, state) => {
    const auth = inject(AuthService);
    if (!auth.isAuthenticated()) return authGuard(route, state);
    return auth.can(permission) || inject(Router).parseUrl('/accesso-negato');
  };
}

/** Pagina iniziale (la chat): chi non può usarla ma vede gli utenti va su «Utenti». */
export const homeGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  if (!auth.isAuthenticated()) return authGuard(route, state);
  if (auth.can('chat.use')) return true;
  return inject(Router).parseUrl(auth.can('users.view') ? '/utenti' : '/accesso-negato');
};
