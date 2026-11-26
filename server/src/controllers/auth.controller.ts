import type { Request, Response } from 'express';
import { Abstract_Controller } from './abstract.controller.js';
import type { Environment } from '../environment.js';
import { currentUser } from '../lib/auth/auth-guard.js';
import { toCurrentUserDto } from '../lib/auth/auth-mapper.js';
import { LOGIN_COOKIE, LOGIN_COOKIE_PATH, SESSION_COOKIE } from '../lib/auth/auth-types.js';
import type { LogoutResponseDto } from '../lib/auth/dto.js';
import { decodeLoginState, encodeLoginState, LOGIN_STATE_TTL_MS } from '../lib/auth/login-state.js';
import { LoginRejectedError, type PasskeyInvite } from '../lib/auth/oidc-client.js';
import { HttpError } from '../lib/http-error.js';

/** Codici d'errore del login, mostrati dalla pagina `/accesso?errore=<codice>`. */
type LoginErrorCode = 'scaduto' | 'annullato' | 'negato' | 'servizio' | 'invito';

/**
 * Accesso con OIDC (pagina di login di ZITADEL), uscita e utente corrente. Montato su
 * `/api/auth`. `/login` e `/callback` sono navigazioni del browser (redirect), non chiamate XHR.
 */
export class AuthController extends Abstract_Controller {
  constructor(env: Environment) {
    super(env, 'auth');
    const { guard } = env.auth;
    this.router.get('/login', guard.public(), this.login.bind(this));
    this.router.get('/callback', guard.public(), this.callback.bind(this));
    this.router.get('/invito', guard.public(), this.invite.bind(this));
    this.router.post('/logout', guard.public(), this.logout.bind(this));
    this.router.get('/me', guard.anyUser(), this.me.bind(this));
  }

  /**
   * Va alla pagina di login di ZITADEL (`?account=altro`: scelta dell'account); lo stato del
   * tentativo resta in un cookie firmato.
   */
  private async login(req: Request, res: Response): Promise<void> {
    const { auth } = this.env.auth;
    let target: { url: string; state: Parameters<typeof encodeLoginState>[0] };
    try {
      target = await auth.startLogin(req.query['returnTo'], req.query['account'] === 'altro');
    } catch {
      return this.loginError(res, 'servizio');
    }
    this.redirectToZitadel(res, target);
  }

  /**
   * Link d'invito (Login V2): registra la passkey su ZITADEL e torna al callback già dentro
   * Dimmelo. Il codice lo verifica ZITADEL (monouso, scade): qui si controlla solo la forma.
   */
  private async invite(req: Request, res: Response): Promise<void> {
    const invite = parseInvite(req.query);
    if (!invite) return this.loginError(res, 'invito');
    let target: { url: string; state: Parameters<typeof encodeLoginState>[0] };
    try {
      target = await this.env.auth.auth.startInvite(invite);
    } catch {
      return this.loginError(res, 'servizio');
    }
    this.redirectToZitadel(res, target);
  }

  /** Stato del tentativo nel cookie firmato, poi via verso ZITADEL. */
  private redirectToZitadel(
    res: Response,
    target: { url: string; state: Parameters<typeof encodeLoginState>[0] },
  ): void {
    const { config } = this.env.auth;
    res.cookie(LOGIN_COOKIE, encodeLoginState(target.state, config.cookieSecret), {
      httpOnly: true,
      secure: config.secureCookies,
      // lax: il ritorno da ZITADEL è una navigazione da un altro sito
      sameSite: 'lax',
      path: LOGIN_COOKIE_PATH,
      maxAge: LOGIN_STATE_TTL_MS,
    });
    res.redirect(target.url);
  }

  /** Ritorno da ZITADEL: apre la sessione di palio e torna dove l'utente voleva andare. */
  private async callback(req: Request, res: Response): Promise<void> {
    const { auth, config, sessions } = this.env.auth;
    const raw = req.cookies?.[LOGIN_COOKIE] as string | undefined;
    res.clearCookie(LOGIN_COOKIE, { path: LOGIN_COOKIE_PATH });
    const state = raw ? decodeLoginState(raw, config.cookieSecret) : null;
    if (!state) return this.loginError(res, 'scaduto');
    const query = req.originalUrl.split('?')[1] ?? '';
    try {
      const { session, returnTo } = await auth.finishLogin(query, state, req.get('user-agent') ?? null);
      res.cookie(SESSION_COOKIE, session.token, sessions.cookieOptions(session.expiresAt));
      res.redirect(returnTo);
    } catch (error) {
      if (error instanceof LoginRejectedError) return this.loginError(res, 'annullato');
      if (error instanceof HttpError && error.status === 403) return this.loginError(res, 'negato');
      console.error(`[auth] Login non riuscito: ${(error as Error).message}`);
      return this.loginError(res, 'servizio');
    }
  }

  /** Chiude la sessione; il client manda poi il browser su `logoutUrl` (uscita da ZITADEL). */
  private async logout(req: Request, res: Response): Promise<void> {
    const { auth, sessions } = this.env.auth;
    const logoutUrl = await auth.logout(req.cookies?.[SESSION_COOKIE] as string | undefined);
    res.clearCookie(SESSION_COOKIE, sessions.cookieOptions());
    res.send({ logoutUrl } satisfies LogoutResponseDto);
  }

  /** Utente corrente con i suoi permessi effettivi (401 se non autenticato). */
  private me(req: Request, res: Response): void {
    res.send(toCurrentUserDto(currentUser(req)));
  }

  private loginError(res: Response, code: LoginErrorCode): void {
    res.redirect(`/accesso?errore=${code}`);
  }
}

/** Parametri del link d'invito (`/api/auth/invito?userId&organization&codeId&code`). */
export function parseInvite(query: Request['query']): PasskeyInvite | null {
  const values = ['userId', 'organization', 'codeId', 'code'].map((key) => query[key]);
  if (!values.every((v): v is string => typeof v === 'string' && /^[\w-]{1,200}$/.test(v))) return null;
  const [userId, organization, codeId, code] = values as [string, string, string, string];
  return { userId, organization, codeId, code };
}
