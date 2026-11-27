/**
 * Configurazione dell'autenticazione (OIDC con ZITADEL, sessioni), dalle variabili d'ambiente.
 * Serve solo all'API: scraper, MCP e task non la caricano.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variabile d'ambiente mancante: ${name}`);
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`Variabile d'ambiente non numerica: ${name}=${raw}`);
  }
  return value;
}

/** ZITADEL: issuer OIDC e API di gestione (con il token di un service account). */
export interface ZitadelConfig {
  /** URL pubblico di ZITADEL (es. https://id.example.com), senza slash finale: è l'issuer. */
  url: string;
  /** Progetto di Dimmelo: i suoi ruoli sono i permessi dell'app. */
  projectId: string;
  /**
   * Personal Access Token del service account di palio (solo backend), per la pagina Utenti.
   * Facoltativo: senza, il login funziona ma la gestione utenti risponde 502.
   */
  token: string | undefined;
  /**
   * Organizzazione di Dimmelo su ZITADEL: ci stanno i suoi utenti, il progetto e il service
   * account. Il login avviene solo lì e la ricerca per email non esce da lì (le altre app hanno
   * la loro organizzazione e i loro utenti).
   */
  organizationId: string;
  /**
   * Il nuovo login di ZITADEL (Login V2, `/ui/v2/login`) è installato: i link d'invito usano
   * la sua pagina, che registra la passkey senza chiedere il nome del dispositivo.
   */
  loginV2: boolean;
}

/** Applicazione web di Dimmelo su ZITADEL (tipo Web, autenticazione Basic). */
export interface OidcClientConfig {
  clientId: string;
  clientSecret: string;
}

export interface AuthConfig {
  /** URL pubblico dell'app (origin del frontend), senza slash finale. */
  appUrl: string;
  /** `true` se l'app è servita in HTTPS: i cookie vengono marcati Secure. */
  secureCookies: boolean;
  /** Segreto per firmare lo stato del login e cifrare i refresh token. */
  cookieSecret: string;
  zitadel: ZitadelConfig;
  oidc: OidcClientConfig;
  session: {
    /** Durata massima della sessione, in giorni. */
    ttlDays: number;
    /** Scadenza per inattività, in giorni. */
    idleDays: number;
  };
}

export function loadAuthConfig(): AuthConfig {
  const appUrl = required('APP_URL').replace(/\/+$/, '');
  const cookieSecret = required('COOKIE_SECRET');
  if (cookieSecret.length < 32) {
    throw new Error('COOKIE_SECRET deve essere lungo almeno 32 caratteri');
  }
  const zitadelUrl = required('ZITADEL_URL').replace(/\/+$/, '');
  const url = new URL(zitadelUrl);
  if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('ZITADEL_URL deve usare https (http è ammesso solo su localhost)');
  }
  return {
    appUrl,
    secureCookies: appUrl.startsWith('https://'),
    cookieSecret,
    zitadel: {
      url: zitadelUrl,
      projectId: required('ZITADEL_PROJECT_ID'),
      token: process.env['ZITADEL_TOKEN'] || undefined,
      organizationId: required('ZITADEL_ORG_ID'),
      loginV2: process.env['ZITADEL_LOGIN_V2'] === 'true',
    },
    oidc: {
      clientId: required('OIDC_CLIENT_ID'),
      clientSecret: required('OIDC_CLIENT_SECRET'),
    },
    session: {
      ttlDays: int('SESSION_TTL_DAYS', 30),
      idleDays: int('SESSION_IDLE_DAYS', 7),
    },
  };
}
