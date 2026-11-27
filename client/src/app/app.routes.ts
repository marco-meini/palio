import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { anonymousGuard, authGuard, permissionGuard } from './core/auth/auth.guard';
import { AuthService } from './core/auth/auth.service';
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
        // home: la chat, o «Palii» / «Utenti» per chi non può usarla (senza sessione: la chat, che porta
        // all'accesso)
        path: '',
        pathMatch: 'full',
        redirectTo: () => {
          const auth = inject(AuthService);
          if (!auth.isAuthenticated() || auth.can('chat.use')) return '/chat';
          if (auth.can('palii.view')) return '/palii';
          return auth.can('users.view') ? '/utenti' : '/accesso-negato';
        },
      },
      {
        path: 'chat',
        canActivate: [permissionGuard('chat.use')],
        children: [
          {
            path: '',
            loadComponent: () => import('./features/chat/chat-list').then((m) => m.ChatList),
          },
          {
            // `nuova` o l'id di una chat salvata
            path: ':id',
            loadComponent: () =>
              import('./features/chat/chat.component').then((m) => m.ChatComponent),
          },
        ],
      },
      {
        path: 'palii',
        canActivate: [permissionGuard('palii.view')],
        children: [
          {
            path: '',
            loadComponent: () => import('./features/palii/palii-list').then((m) => m.PaliiList),
          },
          {
            path: ':id',
            loadComponent: () => import('./features/palii/palio-detail').then((m) => m.PalioDetail),
          },
        ],
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
