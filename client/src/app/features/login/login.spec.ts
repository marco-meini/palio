import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Login } from './login';

const user = {
  id: 1,
  displayName: 'Anna Rossi',
  email: 'anna@example.com',
  isAdmin: false,
  permissions: [],
};

describe('Login', () => {
  let get: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    get = vi.fn();
    vi.stubGlobal('PublicKeyCredential', class {});
    Object.defineProperty(navigator, 'credentials', { value: { get }, configurable: true });
  });

  afterEach(() => vi.unstubAllGlobals());

  const buf = (...b: number[]) => new Uint8Array(b).buffer;

  async function submit(fixture: ReturnType<typeof TestBed.createComponent<Login>>, email: string) {
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input')!;
    input.value = email;
    input.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('email → challenge → passkey → sessione, poi alla destinazione', async () => {
    get.mockResolvedValue({
      id: 'cred',
      rawId: buf(1),
      type: 'public-key',
      response: {
        clientDataJSON: buf(2),
        authenticatorData: buf(3),
        signature: buf(4),
        userHandle: null,
      },
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Login);
    fixture.componentRef.setInput('returnTo', '/spese');
    fixture.detectChanges();

    const done = submit(fixture, ' Anna@Example.com ');
    const start = http.expectOne('/api/auth/passkey/start');
    expect(start.request.body).toEqual({ email: 'anna@example.com' });
    start.flush({ options: { challenge: 'AQID', rpId: 'localhost', allowCredentials: [] } });
    await vi.waitFor(() => expect(get).toHaveBeenCalled());
    expect(get.mock.calls[0]![0].publicKey.rpId).toBe('localhost');

    const finish = await vi.waitFor(() => http.expectOne('/api/auth/passkey/finish'));
    expect(finish.request.body.credential).toEqual({
      id: 'cred',
      rawId: 'AQ',
      type: 'public-key',
      response: {
        clientDataJSON: 'Ag',
        authenticatorData: 'Aw',
        signature: 'BA',
        userHandle: null,
      },
    });
    finish.flush(user);
    await done;
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith('/spese');
    expect(localStorage.getItem('dimmelo.email')).toBe('anna@example.com');
  });

  it('mostra il messaggio del backend (es. nessuna passkey)', async () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    const done = submit(fixture, 'anna@example.com');
    http
      .expectOne('/api/auth/passkey/start')
      .flush(
        { message: 'Per questa email non c’è una passkey' },
        { status: 400, statusText: 'Bad Request' },
      );
    await done;
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('non c’è una passkey');
    expect(get).not.toHaveBeenCalled();
  });

  it('precompila l’email dell’ultimo accesso', async () => {
    localStorage.setItem('dimmelo.email', 'anna@example.com');
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('input')!.value).toBe(
      'anna@example.com',
    );
  });
});
