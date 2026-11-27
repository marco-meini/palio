import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { canapeLabel, fantinoFullName, fantinoName, type PalioDetailDto, type PartecipazioneDto } from '../../core/api/palii-api';
import { PaliiList } from './palii-list';
import { PalioDetail } from './palio-detail';

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('Palii: formati', () => {
  it('fantino col soprannome, canape 10 = rincorsa', () => {
    expect(fantinoName({ nome: 'Andrea Degortes', soprannome: 'Aceto' })).toBe('Aceto');
    expect(fantinoName({ nome: 'Mario Rossi', soprannome: null })).toBe('Mario Rossi');
    expect(fantinoFullName({ nome: 'Andrea Degortes', soprannome: 'Aceto' })).toBe('Andrea Degortes detto Aceto');
    expect(canapeLabel(10)).toBe('Rincorsa');
    expect(canapeLabel(3)).toBe('3');
  });
});

describe('PaliiList', () => {
  it('chiede i Palii con i filtri della query string e li mostra', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({ vincitrice: '12', q: 'Aceto' })) },
        },
      ],
    });
    const fixture = TestBed.createComponent(PaliiList);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await flush();

    http.expectOne('/api/palii/filtri').flush({ contrade: [{ id: 12, name: 'Onda' }], yearMin: 1633, yearMax: 2025 });
    const list = http.expectOne((r) => r.url === '/api/palii');
    expect(list.request.params.get('vincitrice')).toBe('12');
    expect(list.request.params.get('q')).toBe('Aceto');
    expect(list.request.params.has('annoDa')).toBe(false);
    list.flush({
      items: [
        {
          id: 1,
          date: '1990-08-16',
          name: "Palio dell'Assunta",
          straordinario: false,
          pittore: null,
          winner: { contrada: 'Onda', fantino: { nome: 'Andrea Degortes', soprannome: 'Aceto' }, cavallo: 'Uberta' },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    await flush();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('1 Palio');
    expect(text).toContain('Onda');
    expect(text).toContain('Aceto');
    expect(text).toContain('Azzera i filtri');
  });
});

describe('PalioDetail', () => {
  const partecipazione = (over: Partial<PartecipazioneDto>): PartecipazioneDto => ({
    contrada: 'Onda',
    vincitrice: false,
    nonPartecipa: false,
    canape: null,
    ordine: null,
    estratta: false,
    estrattaDa: null,
    ordineAssegnazione: null,
    orecchio: null,
    coscia: null,
    cavallo: null,
    proprietarioCavallo: null,
    cavalloPresoDa: null,
    fantino: null,
    ordineArrivo: null,
    giroCaduta: null,
    capitano: null,
    priore: null,
    barbaresco: null,
    mangini: [],
    ...over,
  });

  it('ordine d\'arrivo con la vincitrice in testa e la caduta', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '7' })) } },
      ],
    });
    const fixture = TestBed.createComponent(PalioDetail);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await flush();

    const detail: PalioDetailDto = {
      id: 7,
      date: '1990-08-16',
      name: "Palio dell'Assunta",
      straordinario: false,
      pittore: 'Un pittore',
      winner: { contrada: 'Onda', fantino: null, cavallo: 'Uberta' },
      previousId: 6,
      nextId: null,
      contrade: [
        partecipazione({ contrada: 'Torre', canape: 10, ordineArrivo: 2, giroCaduta: 3 }),
        partecipazione({ contrada: 'Onda', vincitrice: true, canape: 4, ordineArrivo: 1 }),
      ],
      prove: [],
    };
    http.expectOne('/api/palii/7').flush(detail);
    await flush();
    fixture.detectChanges();

    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')].map((r) => r.textContent ?? '');
    expect(rows[0]).toContain('Onda');
    expect(rows[0]).toContain('Vince');
    expect(rows[1]).toContain('Rincorsa');
    expect(rows[1]).toContain('Cade al 3° giro');
    expect(fixture.nativeElement.textContent).not.toContain('Prove');
    expect(fixture.nativeElement.textContent).toContain('Precedente');
  });
});
