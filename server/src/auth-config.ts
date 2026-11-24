/**
 * Configurazione dell'autenticazione (passkey su ZITADEL, sessioni, email), dalle variabili
 * d'ambiente. Serve solo all'API: scraper, MCP e task non la caricano.
 */

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

/** Provider di identità ZITADEL: API v2 con il token di un service account. */
export interface ZitadelConfig {
  /** URL pubblico di ZITADEL (es. https://id.example.com), senza slash finale. */
  url: string;
  /** Personal Access Token del service account di palio (solo backend). */
  token: string;
  /** Organizzazione in cui creare gli utenti; se assente, quella del service account. */
  organizationId: string | undefined;
}

export interface PasskeyConfig {
  /**
   * Dominio delle passkey (RP ID). Le app che condividono le passkey usano lo stesso dominio
   * padre (es. `example.com` per `casa.example.com` e `palio.example.com`).
   */
  rpId: string;
}

/** Link d'accesso monouso inviati da palio. */
export interface AccessLinkConfig {
  /** Durata dei link d'invito, in ore. */
  inviteTtlHours: number;
  /** Durata dei link di recupero accesso inviati per email, in minuti. */
  recoveryTtlMinutes: number;
}

/** Server SMTP per le email dell'app (recupero accesso). */
export interface MailConfig {
  host: string;
  port: number;
  /** TLS diretto (porta 465); altrimenti STARTTLS se il server lo offre. */
  secure: boolean;
  user: string | undefined;
  password: string | undefined;
  /** Mittente, es. `Dimmelo <dimmelo@example.com>`. */
  from: string;
}

export interface AuthConfig {
  /** URL pubblico dell'app (origin del frontend), senza slash finale. */
  appUrl: string;
  /** `true` se l'app è servita in HTTPS: i cookie vengono marcati Secure. */
  secureCookies: boolean;
  /** Segreto per firmare (HMAC) il cookie temporaneo del login con passkey. */
  cookieSecret: string;
  zitadel: ZitadelConfig;
  passkey: PasskeyConfig;
  accessLinks: AccessLinkConfig;
  /** Assente se SMTP_HOST non è impostato: le email non vengono inviate. */
  mail: MailConfig | undefined;
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
  return {
    appUrl,
    secureCookies: appUrl.startsWith('https://'),
    cookieSecret,
    zitadel: {
      url: required('ZITADEL_URL').replace(/\/+$/, ''),
      token: required('ZITADEL_TOKEN'),
      organizationId: process.env['ZITADEL_ORG_ID'] || undefined,
    },
    passkey: { rpId: passkeyRpId(appUrl) },
    accessLinks: {
      inviteTtlHours: Math.min(Math.max(int('INVITE_TTL_HOURS', 72), 1), 24 * 31),
      recoveryTtlMinutes: Math.min(Math.max(int('RECOVERY_TTL_MINUTES', 60), 5), 1440),
    },
    mail: loadMail(),
    session: {
      ttlDays: int('SESSION_TTL_DAYS', 30),
      idleDays: int('SESSION_IDLE_DAYS', 7),
    },
  };
}

/**
 * RP ID delle passkey: `PASSKEY_RP_ID`, oppure l'host di APP_URL. Deve coincidere con l'host
 * dell'app o esserne un dominio padre, altrimenti il browser rifiuta le passkey.
 */
export function passkeyRpId(appUrl: string, value = process.env['PASSKEY_RP_ID']): string {
  const host = new URL(appUrl).hostname;
  const rpId = (value || host).toLowerCase().replace(/^\.+|\.+$/g, '');
  if (host !== rpId && !host.endsWith(`.${rpId}`)) {
    throw new Error(
      `PASSKEY_RP_ID (${rpId}) deve essere l'host di APP_URL (${host}) o un suo dominio padre`,
    );
  }
  return rpId;
}

function loadMail(): MailConfig | undefined {
  const host = process.env['SMTP_HOST'];
  if (!host) return undefined;
  const port = int('SMTP_PORT', 587);
  return {
    host,
    port,
    secure: process.env['SMTP_SECURE'] ? process.env['SMTP_SECURE'] === 'true' : port === 465,
    user: process.env['SMTP_USER'] || undefined,
    password: process.env['SMTP_PASSWORD'] || undefined,
    from: required('SMTP_FROM'),
  };
}
