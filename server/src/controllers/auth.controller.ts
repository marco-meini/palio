import type { Request, Response } from 'express';
import { Abstract_Controller } from './abstract.controller.js';
import {
  buildGoogleAuthUrl,
  buildMobileAuthRedirect,
  clearSessionCookie,
  createSessionToken,
  exchangeGoogleCode,
  extractSessionToken,
  fetchGoogleUserInfo,
  hasGoogleOAuthCredentials,
  maskEmailForDisplay,
  normalizeEmail,
  OAUTH_STATE_MOBILE,
  resolveAuthorizedUser,
  setSessionCookie,
} from '../lib/auth/session.js';
import { findDimmeloUserByEmail } from '../lib/dimmelo-users.js';

export class AuthController extends Abstract_Controller {
  constructor(env: import('../environment.js').Environment) {
    super(env, 'api/auth');
    this.router.get('/me', this.getMe.bind(this));
    this.router.get('/logout', this.getLogout.bind(this));
    this.router.get('/google', this.getGoogle.bind(this));
    this.router.get('/google/callback', this.getGoogleCallback.bind(this));
    this.validateAuthConfig();
  }

  private validateAuthConfig(): void {
    const { auth } = this.env.config;
    if (!auth?.enabled) return;

    if (!auth.sessionSecret || auth.sessionSecret.length < 32) {
      throw new Error(
        'auth.sessionSecret deve essere impostato (≥32 caratteri) quando auth.enabled è true',
      );
    }

    if (!this.env.pgConnection) {
      throw new Error(
        'config.db è richiesto quando auth.enabled è true (allowlist utenti in dimmelo_users)',
      );
    }

    if (!hasGoogleOAuthCredentials(auth.google)) {
      console.warn(
        'auth.enabled è true ma Google OAuth non è configurato: imposta GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET o GOOGLE_OAUTH_JSON_PATH in .env',
      );
    }
  }

  private isMobileOAuth(req: Request): boolean {
    if (req.query.client === 'mobile') return true;
    return req.query.state === OAUTH_STATE_MOBILE;
  }

  private redirectOAuthError(
    res: Response,
    auth: import('../config.js').AppConfig['auth'],
    isMobile: boolean,
    error: string,
    extra: Record<string, string> = {},
  ): void {
    if (isMobile) {
      res.redirect(buildMobileAuthRedirect(auth.mobileRedirectUri, { error, ...extra }));
      return;
    }
    const errorUrl = new URL('/login', auth.publicAppUrl);
    errorUrl.searchParams.set('error', error);
    for (const [key, value] of Object.entries(extra)) {
      errorUrl.searchParams.set(key, value);
    }
    res.redirect(errorUrl.toString());
  }

  private async getMe(req: Request, res: Response): Promise<void> {
    const { auth } = this.env.config;
    if (!auth?.enabled) {
      res.send({ email: null, name: null, authEnabled: false });
      return;
    }

    const token = extractSessionToken(req);
    const user = await resolveAuthorizedUser(this.env.pgConnection, token, auth);
    if (!user) {
      res.status(401).send({ error: 'Non autenticato' });
      return;
    }

    res.send({
      email: user.email,
      name: user.name,
      authEnabled: true,
    });
  }

  private async getLogout(_req: Request, res: Response): Promise<void> {
    clearSessionCookie(res);
    res.send({ ok: true });
  }

  private async getGoogle(req: Request, res: Response): Promise<void> {
    const { auth } = this.env.config;
    if (!auth?.enabled) {
      res.status(404).send({ error: 'Auth disabilitata' });
      return;
    }

    if (!hasGoogleOAuthCredentials(auth.google)) {
      res.status(503).send({
        error:
          'Google OAuth non configurato. Imposta GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET o GOOGLE_OAUTH_JSON_PATH in .env',
      });
      return;
    }

    const isMobile = this.isMobileOAuth(req);
    res.redirect(
      buildGoogleAuthUrl(auth, isMobile ? { state: OAUTH_STATE_MOBILE } : {}),
    );
  }

  private async getGoogleCallback(req: Request, res: Response): Promise<void> {
    const { auth } = this.env.config;
    if (!auth?.enabled) {
      res.status(404).send({ error: 'Auth disabilitata' });
      return;
    }

    if (!hasGoogleOAuthCredentials(auth.google)) {
      res.status(503).send({
        error:
          'Google OAuth non configurato. Imposta GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET o GOOGLE_OAUTH_JSON_PATH in .env',
      });
      return;
    }

    const isMobile = this.isMobileOAuth(req);
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) {
      this.redirectOAuthError(res, auth, isMobile, 'oauth_failed');
      return;
    }

    try {
      const { access_token } = await exchangeGoogleCode(auth, code);
      const userInfo = await fetchGoogleUserInfo(access_token);
      const email = normalizeEmail(userInfo.email);
      const row = await findDimmeloUserByEmail(this.env.pgConnection, email);

      if (!row) {
        const masked = maskEmailForDisplay(email);
        console.warn(`Google login denied: email not in dimmelo_users (${masked || 'missing'})`);
        this.redirectOAuthError(res, auth, isMobile, 'access_denied', masked ? { email: masked } : {});
        return;
      }

      const sessionToken = await createSessionToken(
        { email: row.email, name: row.display_name },
        auth.sessionSecret,
        auth.sessionTtlSeconds,
      );
      setSessionCookie(res, auth, sessionToken);

      if (isMobile) {
        res.redirect(buildMobileAuthRedirect(auth.mobileRedirectUri, { token: sessionToken }));
        return;
      }

      res.redirect(auth.publicAppUrl);
    } catch (err) {
      console.error('Google OAuth callback failed', err);
      this.redirectOAuthError(res, auth, isMobile, 'oauth_failed');
    }
  }
}
