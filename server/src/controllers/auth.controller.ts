import type { Request, Response } from 'express';
import { Abstract_Controller } from './abstract.controller.js';
import type { Environment } from '../environment.js';
import { currentUser } from '../lib/auth/auth-guard.js';
import { toCurrentUserDto } from '../lib/auth/auth-mapper.js';
import type { SignedIn } from '../lib/auth/auth-service.js';
import { LOGIN_COOKIE, LOGIN_COOKIE_PATH, SESSION_COOKIE } from '../lib/auth/auth-types.js';
import { emailFrom, isEmail } from '../lib/auth/email.js';
import { decodeLoginState, encodeLoginState, LOGIN_STATE_TTL_MS } from '../lib/auth/login-state.js';
import { parseCredential } from '../lib/auth/passkey-credential.js';
import { badRequest, unauthorized } from '../lib/http-error.js';

/**
 * Accesso con passkey nella pagina di palio, uscita, utente corrente e recupero dell'accesso.
 * Montato su `/api/auth`.
 */
export class AuthController extends Abstract_Controller {
  constructor(env: Environment) {
    super(env, 'auth');
    const { guard } = env.auth;
    this.router.post('/passkey/start', guard.public(), this.passkeyStart.bind(this));
    this.router.post('/passkey/finish', guard.public(), this.passkeyFinish.bind(this));
    this.router.post('/logout', guard.public(), this.logout.bind(this));
    this.router.get('/me', guard.anyUser(), this.me.bind(this));
    this.router.post('/recovery', guard.public(), this.recovery.bind(this));
  }

  /**
   * Inizio dell'accesso con passkey. Restituisce la challenge da far firmare al browser e
   * tiene la sessione ZITADEL in un cookie firmato, valido pochi minuti.
   */
  private async passkeyStart(req: Request, res: Response): Promise<void> {
    const { auth, config } = this.env.auth;
    const email = emailFrom(req.body);
    if (!isEmail(email)) throw badRequest('Email non valida');
    const { options, state } = await auth.startLogin(email, req.ip ?? 'unknown');
    res.cookie(LOGIN_COOKIE, encodeLoginState(state, config.cookieSecret), {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'strict',
      path: LOGIN_COOKIE_PATH,
      maxAge: LOGIN_STATE_TTL_MS,
    });
    res.send({ options });
  }

  /** Fine dell'accesso: se la passkey è valida apre la sessione di palio. */
  private async passkeyFinish(req: Request, res: Response): Promise<void> {
    const { auth, config } = this.env.auth;
    const raw = req.cookies?.[LOGIN_COOKIE] as string | undefined;
    res.clearCookie(LOGIN_COOKIE, { path: LOGIN_COOKIE_PATH });
    const state = raw ? decodeLoginState(raw, config.cookieSecret) : null;
    if (!state) throw unauthorized('Accesso scaduto: riprova.');
    const credential = parseCredential((req.body as { credential?: unknown } | null)?.credential);
    const signedIn = await auth.finishLogin(state, credential, req.get('user-agent') ?? null);
    this.startSession(res, signedIn);
  }

  /** Chiude la sessione su questo dispositivo. */
  private async logout(req: Request, res: Response): Promise<void> {
    const { auth, sessions } = this.env.auth;
    await auth.logout(req.cookies?.[SESSION_COOKIE] as string | undefined);
    res.clearCookie(SESSION_COOKIE, sessions.cookieOptions());
    res.status(204).end();
  }

  /** Utente corrente con i suoi permessi effettivi (401 se non autenticato). */
  private me(req: Request, res: Response): void {
    res.send(toCurrentUserDto(currentUser(req)));
  }

  /**
   * Chi lo usa non riesce ad accedere. Risponde sempre 202 senza dire se l'email è censita;
   * il link arriva solo all'indirizzo registrato. Limiti per IP e per email.
   */
  private recovery(req: Request, res: Response): void {
    const email = emailFrom(req.body);
    if (!isEmail(email)) throw badRequest('Email non valida');
    this.env.auth.recovery.request(email, req.ip ?? 'unknown');
    res.status(202).end();
  }

  private startSession(res: Response, { user, session }: SignedIn): void {
    res.cookie(SESSION_COOKIE, session.token, this.env.auth.sessions.cookieOptions(session.expiresAt));
    res.send(toCurrentUserDto(user));
  }
}
