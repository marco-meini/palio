import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CurrentUserDto, PermissionSectionDto, UserDto } from '../../core/auth/dto';
import { AuthService } from '../../core/auth/auth.service';
import { vi } from 'vitest';
import { InvitePanel } from './invite-panel';
import { UserForm } from './user-form';
import { UsersList } from './users-list';

const user = (over: Partial<UserDto>): UserDto => ({
  id: 1,
  firstName: 'Anna',
  lastName: 'Rossi',
  displayName: 'Anna Rossi',
  email: 'anna@example.com',
  phone: null,
  isAdmin: false,
  permissions: ['users.view'],
  status: 'active',
  lastLoginAt: '2026-11-01T10:00:00Z',
  createdAt: '2026-10-01T10:00:00Z',
  ...over,
});

const catalog: PermissionSectionDto[] = [
  {
    key: 'users',
    label: 'Utenti',
    permissions: [
      { key: 'users.view', label: 'Vedere', description: '', implies: [] },
      { key: 'users.manage', label: 'Modificare', description: '', implies: ['users.view'] },
    ],
  },
];

const me = (over: Partial<CurrentUserDto> = {}): CurrentUserDto => ({
  id: 99,
  displayName: 'Io',
  email: 'io@example.com',
  isAdmin: true,
  permissions: ['users.view', 'users.manage'],
  ...over,
});

const settle = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  await fixture.whenStable();
  fixture.detectChanges();
};

describe('Utenti', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService).signedIn(me());
  });

  const openForm = async () => {
    const fixture = TestBed.createComponent(UserForm);
    TestBed.inject(HttpTestingController).expectOne('/api/permissions').flush(catalog);
    await settle(fixture);
    return { fixture, root: fixture.nativeElement as HTMLElement };
  };
  const checkbox = (root: HTMLElement, label: string) =>
    [...root.querySelectorAll('label')]
      .find((l) => l.textContent!.trim().startsWith(label))!
      .querySelector<HTMLInputElement>('input')!;

  it('elenco: mostra nome, stato e contatti', async () => {
    const fixture = TestBed.createComponent(UsersList);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/users')
      .flush([
        user({}),
        user({
          id: 2,
          firstName: 'Luca',
          displayName: 'Luca Bianchi',
          status: 'invited',
          lastLoginAt: null,
          phone: '333 1234567',
        }),
        user({ id: 3, displayName: 'Ex Ospite', status: 'disabled', permissions: [] }),
        user({ id: 4, displayName: 'Capo', isAdmin: true }),
      ]);
    await settle(fixture);
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Anna Rossi');
    expect(text).toContain('Invitato');
    expect(text).toContain('333 1234567');
    expect(text).toContain("Non ha ancora effettuato l'accesso");
    expect(text).toContain('Disattivato');
    expect(text).toContain('Riattiva');
    expect(text).toContain('1 permesso');
    expect(text).toContain('Nessun permesso');
    expect(text).toContain('Amministratore');
  });

  it('elenco: elimina dopo la conferma nella modale', async () => {
    const fixture = TestBed.createComponent(UsersList);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/users')
      .flush([user({ id: 99, displayName: 'Io' }), user({ id: 2, displayName: 'Luca Bianchi' })]);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const buttons = () => [...root.querySelectorAll('button')];
    // niente "Elimina" su sé stessi: c'è solo quello di Luca
    const remove = buttons().filter((b) => b.textContent!.trim() === 'Elimina');
    expect(remove.length).toBe(1);
    remove[0]!.click();
    await settle(fixture);
    const dialog = root.querySelector('[role=dialog]')!;
    expect(dialog.textContent).toContain('Luca Bianchi');
    http.expectNone({ method: 'DELETE' });
    buttons()
      .find((b) => b.textContent!.includes('Sì, elimina'))!
      .click();
    const req = http.expectOne('/api/users/2');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await vi.waitFor(() => http.expectOne('/api/users').flush([user({ id: 99 })]));
    await settle(fixture);
    expect(root.querySelector('[role=dialog]')).toBeNull();
  });

  it('elenco: chi può solo vedere non ha i pulsanti di modifica', async () => {
    TestBed.inject(AuthService).signedIn(me({ isAdmin: false, permissions: ['users.view'] }));
    const fixture = TestBed.createComponent(UsersList);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/users')
      .flush([user({})]);
    await settle(fixture);
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).not.toContain('Nuovo utente');
    expect(text).not.toContain('Disattiva');
    expect(text).toContain('Dettagli');
  });

  it('form: non invia se mancano i campi obbligatori', async () => {
    const { fixture } = await openForm();
    const form = (fixture.nativeElement as HTMLElement).querySelector('form')!;
    form.dispatchEvent(new Event('submit'));
    await settle(fixture);
    TestBed.inject(HttpTestingController).expectNone('/api/users');
    expect(form.textContent).toContain('Campo obbligatorio');
  });

  it('form: crea l’utente con i permessi e mostra il link d’invito', async () => {
    const { fixture, root } = await openForm();
    const set = (name: string, value: string) => {
      const el = root.querySelector<HTMLInputElement>(`input[formcontrolname="${name}"]`)!;
      el.value = value;
      el.dispatchEvent(new Event('input'));
    };
    set('firstName', 'Luca');
    set('lastName', 'Bianchi');
    set('email', 'luca@example.com');
    // modificare comprende vedere
    checkbox(root, 'Modificare').click();
    await settle(fixture);
    expect(checkbox(root, 'Vedere').checked).toBe(true);
    root.querySelector('form')!.dispatchEvent(new Event('submit'));

    const req = TestBed.inject(HttpTestingController).expectOne('/api/users');
    expect(req.request.body).toEqual({
      firstName: 'Luca',
      lastName: 'Bianchi',
      email: 'luca@example.com',
      phone: null,
      isAdmin: false,
      permissions: ['users.manage'],
    });
    req.flush({
      user: user({ id: 2, firstName: 'Luca', displayName: 'Luca Bianchi', status: 'invited' }),
      invite: { url: 'http://localhost:1411/lc/abc', expiresAt: '2026-11-20T10:00:00Z' },
    });
    await settle(fixture);
    expect(root.textContent).toContain('Luca Bianchi');
    expect(root.querySelector<HTMLInputElement>('input[readonly]')!.value).toBe(
      'http://localhost:1411/lc/abc',
    );
  });

  it('form: togliere vedere toglie anche modificare; amministratore spunta tutto', async () => {
    const { fixture, root } = await openForm();
    checkbox(root, 'Modificare').click();
    await settle(fixture);
    checkbox(root, 'Vedere').click();
    await settle(fixture);
    expect(checkbox(root, 'Modificare').checked).toBe(false);
    checkbox(root, 'Amministratore').click();
    await settle(fixture);
    expect(checkbox(root, 'Vedere').checked).toBe(true);
    expect(checkbox(root, 'Vedere').disabled).toBe(true);
  });

  it('form: chi gestisce gli utenti senza essere amministratore non nomina amministratori', async () => {
    TestBed.inject(AuthService).signedIn(
      me({ isAdmin: false, permissions: ['users.view', 'users.manage'] }),
    );
    const { root } = await openForm();
    expect(checkbox(root, 'Amministratore').disabled).toBe(true);
    expect(checkbox(root, 'Modificare').disabled).toBe(false);
  });

  it('form: chi può solo vedere apre la scheda in sola lettura', async () => {
    TestBed.inject(AuthService).signedIn(me({ isAdmin: false, permissions: ['users.view'] }));
    const { root } = await openForm();
    expect(checkbox(root, 'Vedere').disabled).toBe(true);
    expect(root.querySelector('button[type="submit"]')).toBeNull();
  });

  it('pannello invito: copia il link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const fixture = TestBed.createComponent(InvitePanel);
    fixture.componentRef.setInput('invite', {
      url: 'http://id/lc/x',
      expiresAt: '2026-11-20T10:00:00Z',
    });
    fixture.componentRef.setInput('name', 'Luca');
    await settle(fixture);
    const copy = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Copia'),
    )!;
    copy.click();
    await settle(fixture);
    expect(writeText).toHaveBeenCalledWith('http://id/lc/x');
    expect(copy.textContent).toContain('Copiato');
    vi.unstubAllGlobals();
  });
});
