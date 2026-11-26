import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { Permission } from '../auth/dto';
import { AuthService } from '../auth/auth.service';
import { AppShell } from './app-shell';

@Component({ template: '' })
class Dummy {}

/** Storage in memoria: il test non dipende dal localStorage dell'ambiente. */
function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  });
  return data;
}

async function setup(permissions: Permission[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: '', component: Dummy },
        { path: 'utenti', component: Dummy },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const loading = TestBed.inject(AuthService).load();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/auth/me')
    .flush({ id: 'z-1', displayName: 'Anna Maria Rossi', email: 'anna@example.com', permissions });
  await loading;
  const fixture = TestBed.createComponent(AppShell);
  await fixture.whenStable();
  return { fixture, shell: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

const navLabels = (el: HTMLElement) =>
  [...el.querySelectorAll('nav a')].map((a) => a.textContent!.trim());

describe('AppShell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('voci in base ai permessi, iniziali ed email dell’utente', async () => {
    stubStorage();
    const all = await setup(['chat.use', 'users.view', 'users.manage']);
    expect(navLabels(all.el)).toEqual(['Chat', 'Utenti']);
    expect(all.el.querySelector('aside')!.textContent).toContain('AM');
    expect(all.el.querySelector('aside')!.textContent).toContain('anna@example.com');
    TestBed.resetTestingModule();
    const chat = await setup(['chat.use']);
    expect(navLabels(chat.el)).toEqual(['Chat']);
    TestBed.resetTestingModule();
    const viewer = await setup(['users.view']);
    expect(navLabels(viewer.el)).toEqual(['Utenti']);
  });

  it('riduce la sidebar e ricorda la scelta', async () => {
    const storage = stubStorage();
    const { fixture, el } = await setup(['chat.use']);
    const aside = el.querySelector('aside')!;
    expect(aside.className).toContain('lg:w-64');
    el.querySelector<HTMLButtonElement>('[aria-label="Riduci il menu"]')!.click();
    fixture.detectChanges();
    expect(aside.className).toContain('lg:w-18');
    expect(storage.get('dimmelo.sidebar.collapsed')).toBe('true');

    TestBed.resetTestingModule();
    const again = await setup(['chat.use']);
    expect(again.el.querySelector('aside')!.className).toContain('lg:w-18');
  });

  it('mobile: si apre con ☰ e si chiude navigando, toccando fuori o con Esc', async () => {
    stubStorage();
    const { fixture, shell, el } = await setup(['chat.use', 'users.view']);
    const aside = el.querySelector('aside')!;
    const open = () => {
      el.querySelector<HTMLButtonElement>('[aria-label="Apri il menu"]')!.click();
      fixture.detectChanges();
      expect(aside.className).toContain('translate-x-0 ');
    };

    open();
    await TestBed.inject(Router).navigateByUrl('/utenti');
    fixture.detectChanges();
    expect(shell.mobileOpen()).toBe(false);
    expect(aside.className).toContain('-translate-x-full');

    open();
    el.querySelector<HTMLElement>('div[aria-hidden="true"].fixed')!.click();
    expect(shell.mobileOpen()).toBe(false);

    open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(shell.mobileOpen()).toBe(false);
  });
});
