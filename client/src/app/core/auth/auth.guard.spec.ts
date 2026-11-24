import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { anonymousGuard, authGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Component({ template: '' })
class Dummy {}

async function setup(user: object | null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'accesso', canActivate: [anonymousGuard], component: Dummy },
        { path: 'spese', canActivate: [authGuard], component: Dummy },
        { path: '', canActivate: [authGuard], component: Dummy },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const loading = TestBed.inject(AuthService).load();
  const req = TestBed.inject(HttpTestingController).expectOne('/api/auth/me');
  if (user) req.flush(user);
  else req.flush(null, { status: 401, statusText: 'Unauthorized' });
  await loading;
  return TestBed.inject(Router);
}

const anna = { id: 1, displayName: 'Anna', email: null, isAdmin: false, permissions: [] };

describe('authGuard / anonymousGuard', () => {
  it('senza sessione porta alla pagina di accesso con la destinazione', async () => {
    const router = await setup(null);
    await router.navigateByUrl('/spese?mese=3');
    expect(router.url).toBe('/accesso?returnTo=%2Fspese%3Fmese%3D3');
  });

  it('senza sessione, dalla home, nessun returnTo', async () => {
    const router = await setup(null);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/accesso');
  });

  it('con sessione la pagina di accesso rimanda alla destinazione', async () => {
    const router = await setup(anna);
    await router.navigateByUrl('/accesso?returnTo=%2Fspese');
    expect(router.url).toBe('/spese');
  });

  it('con sessione ignora destinazioni esterne', async () => {
    const router = await setup(anna);
    await router.navigateByUrl('/accesso?returnTo=%2F%2Fevil.example');
    expect(router.url).toBe('/');
  });
});
