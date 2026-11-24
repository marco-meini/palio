import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Recovery } from './recovery';

describe('Recupero accesso', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('chiede il link e mostra sempre lo stesso messaggio', async () => {
    const fixture = TestBed.createComponent(Recovery);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input')!;
    input.value = 'anna@example.com';
    input.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    const req = TestBed.inject(HttpTestingController).expectOne('/api/auth/recovery');
    expect(req.request.body).toEqual({ email: 'anna@example.com' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Controlla la posta');
  });

  it('email non valida: nessuna richiesta', () => {
    const fixture = TestBed.createComponent(Recovery);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectNone('/api/auth/recovery');
    expect(el.textContent).toContain('Scrivi un indirizzo email valido');
  });
});
