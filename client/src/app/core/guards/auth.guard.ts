import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const me = await auth.getMe();

  if (auth.isAuthDisabled(me)) {
    return true;
  }

  if (me.error || !me.email?.trim()) {
    return router.createUrlTree(['/login']);
  }

  return true;
};
