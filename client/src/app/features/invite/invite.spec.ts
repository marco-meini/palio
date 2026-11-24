import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { InviteStatusDto } from '../../core/auth/dto';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Invite } from './invite';

const status: InviteStatusDto = {
  firstName: 'Pippo',
  email: 'pippo@example.com',
  expiresAt: '2026-11-20T22:41:00Z',
};
const buf = (...b: number[]) => new Uint8Array(b).buffer;

describe('Invito', () => {
  let create: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    create = vi.fn();
    vi.stubGlobal('PublicKeyCredential', class {});
    Object.defineProperty(navigator, 'credentials', { value: { create }, configurable: true });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => vi.unstubAllGlobals());

  const open = async (
    flush: (r: ReturnType<HttpTestingController['expectOne']>) => void = (r) => r.flush(status),
  ) => {
    const fixture = TestBed.createComponent(Invite);
    fixture.componentRef.setInput('token', 'tok');
    fixture.detectChanges();
    flush(TestBed.inject(HttpTestingController).expectOne('/api/invites/tok'));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const button = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes(text))!;

  it('crea la passkey nella pagina ed entra in Dimmelo', async () => {
    create.mockResolvedValue({
      id: 'cred',
      rawId: buf(1),
      type: 'public-key',
      response: { clientDataJSON: buf(2), attestationObject: buf(3) },
    });
    const http = TestBed.inject(HttpTestingController);
    const { fixture, el } = await open();
    expect(el.textContent).toContain('Ciao Pippo!');

    button(el, 'Crea la passkey').click();
    http.expectOne('/api/invites/tok/passkey/start').flush({
      passkeyId: 'pk-1',
      options: {
        challenge: 'AQID',
        rp: { id: 'localhost', name: 'Dimmelo' },
        user: { id: 'BAU', name: 'pippo' },
      },
    });
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    const finish = await vi.waitFor(() => http.expectOne('/api/invites/tok/passkey/finish'));
    expect(finish.request.body).toEqual({
      passkeyId: 'pk-1',
      credential: {
        id: 'cred',
        rawId: 'AQ',
        type: 'public-key',
        response: { clientDataJSON: 'Ag', attestationObject: 'Aw' },
      },
    });
    finish.flush({
      id: 7,
      displayName: 'Pippo Rossi',
      email: 'pippo@example.com',
      isAdmin: false,
      permissions: [],
    });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    expect(TestBed.inject(AuthService).user()?.id).toBe(7);
    expect(localStorage.getItem('dimmelo.email')).toBe('pippo@example.com');
    fixture.detectChanges();
  });

  it('Face ID annullato: messaggio e si può riprovare', async () => {
    create.mockRejectedValue(new DOMException('annullato', 'NotAllowedError'));
    const http = TestBed.inject(HttpTestingController);
    const { fixture, el } = await open();
    button(el, 'Crea la passkey').click();
    http.expectOne('/api/invites/tok/passkey/start').flush({
      passkeyId: 'pk-1',
      options: { challenge: 'AQID', rp: { id: 'localhost' }, user: { id: 'BAU' } },
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.textContent).toContain('Operazione annullata');
    });
    expect(button(el, 'Crea la passkey').disabled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('"ho già una passkey": alla pagina di accesso con l’email', async () => {
    const { el } = await open();
    button(el, 'Ho già una passkey').click();
    expect(navigate).toHaveBeenCalledWith('/accesso');
    expect(localStorage.getItem('dimmelo.email')).toBe('pippo@example.com');
  });

  it('link scaduto o già usato', async () => {
    const { el } = await open((r) =>
      r.flush({ message: 'scaduto' }, { status: 410, statusText: 'Gone' }),
    );
    expect(el.textContent).toContain('Il link è scaduto');
  });
});
