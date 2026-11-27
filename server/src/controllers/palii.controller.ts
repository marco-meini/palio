import type { Request, Response } from 'express';
import { Abstract_Controller } from './abstract.controller.js';
import type { Environment } from '../environment.js';
import { createDb } from '../lib/db.js';
import { badRequest } from '../lib/http-error.js';
import type { PalioFilters, PalioKind } from '../lib/palii/palii-dto.js';
import { PaliiService } from '../lib/palii/palii-service.js';
import { ModelPaliiArchive } from '../model/palii-archive.model.js';

/** Massima lunghezza del testo cercato. */
const MAX_QUERY_CHARS = 100;

/**
 * Archivio dei Palii in sola lettura (`palii.view`): `GET /api/palii` (elenco filtrato, a
 * pagine), `GET /api/palii/filtri` (contrade e anni per i filtri), `GET /api/palii/:id` (scheda).
 */
export class PaliiController extends Abstract_Controller {
  private readonly palii: PaliiService;

  constructor(env: Environment) {
    super(env, 'palii');
    this.palii = new PaliiService(new ModelPaliiArchive(createDb(env.pgConnection)));
    const view = env.auth.guard.require('palii.view');
    this.router.get('/palii', view, this.list.bind(this));
    this.router.get('/palii/filtri', view, this.filters.bind(this));
    this.router.get('/palii/:id', view, this.get.bind(this));
  }

  private async list(req: Request, res: Response): Promise<void> {
    res.send(await this.palii.list(parsePaliiFilters(req.query)));
  }

  private async filters(_req: Request, res: Response): Promise<void> {
    res.send(await this.palii.filters());
  }

  private async get(req: Request, res: Response): Promise<void> {
    res.send(await this.palii.get(positiveInt(req.params['id'], 'Id non valido')));
  }
}

/** Filtri dell'elenco dalla query string (`annoDa`, `annoA`, `vincitrice`, `tipo`, `q`, `pagina`). */
export function parsePaliiFilters(query: Request['query']): PalioFilters {
  const text = (name: string): string | undefined => {
    const value = query[name];
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string') throw badRequest(`Parametro ${name} non valido`);
    return value;
  };
  const year = (name: string): number | undefined => {
    const value = text(name);
    if (value === undefined) return undefined;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1000 || n > 9999) throw badRequest('Anno non valido');
    return n;
  };
  const rawKind = text('tipo');
  if (rawKind !== undefined && !isKind(rawKind)) {
    throw badRequest('Tipo non valido: ordinari o straordinari');
  }
  const kind = rawKind as PalioKind | undefined;
  const q = text('q')?.trim();
  if (q && q.length > MAX_QUERY_CHARS) throw badRequest('Testo da cercare troppo lungo');
  const winner = text('vincitrice');
  const page = text('pagina');
  return {
    yearFrom: year('annoDa'),
    yearTo: year('annoA'),
    winnerId: winner === undefined ? undefined : positiveInt(winner, 'Contrada non valida'),
    kind,
    q: q || undefined,
    page: page === undefined ? 1 : positiveInt(page, 'Pagina non valida'),
  };
}

function isKind(value: string): value is PalioKind {
  return value === 'ordinari' || value === 'straordinari';
}

function positiveInt(value: unknown, message: string): number {
  const n = Number(value);
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value) || n <= 0) throw badRequest(message);
  return n;
}
