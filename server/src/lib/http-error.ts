import type { NextFunction, Request, Response } from 'express';

/**
 * Errore con status HTTP e messaggio per l'utente (in italiano). Il corpo della risposta è
 * `{ message, errors? }`: `errors` porta gli errori per campo dei moduli.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, errors?: Record<string, string>) =>
  new HttpError(400, message, errors);
export const unauthorized = (message = 'Autenticazione richiesta') => new HttpError(401, message);
export const forbidden = (message: string) => new HttpError(403, message);
export const notFound = (message: string) => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
export const gone = (message: string) => new HttpError(410, message);
export const tooManyRequests = (message: string) => new HttpError(429, message);
export const badGateway = (message: string) => new HttpError(502, message);

/** Middleware finale: `HttpError` → risposta JSON; il resto → 500 (dettaglio solo nel log). */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).send(err.errors ? { message: err.message, errors: err.errors } : { message: err.message });
    return;
  }
  // JSON malformato da express.json()
  if (err instanceof SyntaxError && (err as { status?: number }).status === 400) {
    res.status(400).send({ message: 'Richiesta non valida' });
    return;
  }
  console.error(`${req.method} ${req.originalUrl}:`, err);
  res.status(500).send({ message: 'Errore interno del server' });
}
