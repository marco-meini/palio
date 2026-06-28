import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { ChatComponent } from './features/chat/chat.component';
import { LoginComponent } from './features/login/login.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: ChatComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
