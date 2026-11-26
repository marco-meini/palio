import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { browserLocation } from '../../core/auth/auth.service';
import { Login } from './login';

describe('Login', () => {
  let assign: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    assign = vi.spyOn(browserLocation, 'assign').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  const render = (inputs: Record<string, string> = {}) => {
    const fixture = TestBed.createComponent(Login);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('«Accedi» porta al login del backend con la destinazione', () => {
    render({ returnTo: '/utenti?x=1' }).querySelector('button')!.click();
    expect(assign).toHaveBeenCalledWith('/api/auth/login?returnTo=%2Futenti%3Fx%3D1');
  });

  it('destinazioni esterne ignorate', () => {
    render({ returnTo: '//evil.example' }).querySelector('button')!.click();
    expect(assign).toHaveBeenCalledWith('/api/auth/login?returnTo=%2F');
  });

  it('mostra il motivo se l’accesso non è riuscito', () => {
    expect(render({ errore: 'servizio' }).textContent).toContain('non risponde');
    expect(render().querySelector('[role=alert]')).toBeNull();
  });

  it('account senza accesso: propone di accedere con un altro account', () => {
    const root = render({ errore: 'negato' });
    expect(root.textContent).toContain('non ha accesso a Dimmelo');
    const button = root.querySelector('button')!;
    expect(button.textContent).toContain('Accedi con un altro account');
    button.click();
    expect(assign).toHaveBeenCalledWith('/api/auth/login?returnTo=%2F&account=altro');
  });

  it('«Usa un altro account» sempre disponibile', () => {
    const other = [...render().querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Usa un altro account'),
    )!;
    other.click();
    expect(assign).toHaveBeenCalledWith('/api/auth/login?returnTo=%2F&account=altro');
  });
});
