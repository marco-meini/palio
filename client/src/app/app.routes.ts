import { Routes } from '@angular/router';
import { anonymousGuard, authGuard, homeGuard, permissionGuard } from './core/auth/auth.guard';
import { AppShell } from './core/layout/app-shell';

export const routes: Routes = [
  {
    path: 'accesso',
    canActivate: [anonymousGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: 'accesso-negato',
    loadComponent: () =>
      import('./features/access-denied/access-denied').then((m) => m.AccessDenied),
  },
  {
    path: 'uscito',
    loadComponent: () => import('./features/signed-out/signed-out').then((m) => m.SignedOut),
  },
  {
    path: '',
    component: AppShell,
    canActivateChild: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [homeGuard],
        loadComponent: () =>
          import('./features/chat/chat.component').then((m) => m.ChatComponent),
      },
      {
        path: 'utenti',
        canActivate: [permissionGuard('users.view')],
        children: [
          {
            path: '',
            loadComponent: () => import('./features/users/users-list').then((m) => m.UsersList),
          },
          {
            path: 'nuovo',
            canActivate: [permissionGuard('users.manage')],
            loadComponent: () => import('./features/users/user-form').then((m) => m.UserForm),
          },
          {
            path: ':id',
            loadComponent: () => import('./features/users/user-form').then((m) => m.UserForm),
          },
        ],
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
