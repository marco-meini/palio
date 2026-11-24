import type { AuthConfig } from '../../auth-config.js';
import type { ModelUsers } from '../../model/users.model.js';
import type { IAppUserRecord } from '../auth/auth-types.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import type { MailService } from '../mail.js';
import type { InvitesService } from './invites-service.js';

const TIME = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Rome',
});

/**
 * Recupero dell'accesso in autonomia: chi non riesce a entrare (passkey persa, dispositivo
 * nuovo) chiede un link via email e crea una passkey sul dispositivo che sta usando.
 *
 * La risposta è sempre la stessa e arriva prima di qualsiasi verifica, così non si scopre
 * quali email sono censite. Limiti: per IP e per indirizzo.
 */
export class RecoveryService {
  private readonly perIp = new RateLimiter(10, 15 * 60_000);
  private readonly perEmail = new RateLimiter(3, 60 * 60_000);

  constructor(
    private readonly config: Pick<AuthConfig, 'accessLinks'>,
    private readonly repository: ModelUsers,
    private readonly invites: InvitesService,
    private readonly mail: MailService,
  ) {}

  /** Avvia l'invio in background; ritorna subito, comunque vada. */
  request(email: string, ip: string): void {
    if (!this.perIp.hit(ip) || !this.perEmail.hit(email)) {
      console.warn(`[recovery] Troppe richieste di recupero (ip ${ip})`);
      return;
    }
    void this.send(email).catch((error: unknown) => {
      console.error(`[recovery] Recupero accesso non inviato: ${(error as Error).message}`);
    });
  }

  /** Esposto per i test: esegue davvero l'invio. */
  async send(email: string): Promise<boolean> {
    const user = await this.repository.findByEmail(email);
    if (!user || user.disabled_at) return false;
    const invite = await this.invites.issue(user, this.config.accessLinks.recoveryTtlMinutes);
    await this.mail.send({
      to: user.email,
      subject: 'Accedi a Dimmelo',
      ...recoveryMessage(user, invite.url, new Date(invite.expiresAt)),
    });
    console.info(`[recovery] Link di recupero inviato all'utente ${user.id}`);
    return true;
  }
}

function recoveryMessage(
  user: IAppUserRecord,
  url: string,
  expiresAt: Date,
): { text: string; html: string } {
  const until = TIME.format(expiresAt);
  const text = [
    `Ciao ${user.first_name},`,
    '',
    'hai chiesto di entrare in Dimmelo da un nuovo dispositivo. Apri questo link e crea la tua passkey:',
    '',
    url,
    '',
    `Il link vale una sola volta, fino al ${until}.`,
    'Se non hai chiesto tu questo accesso, ignora questa email: senza il link nessuno può entrare.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="it"><body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:16px;padding:32px">
    <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#92400e">Dimmelo</p>
    <p style="margin:0 0 12px">Ciao ${escapeHtml(user.first_name)},</p>
    <p style="margin:0 0 24px">hai chiesto di entrare in Dimmelo da un nuovo dispositivo. Premi il pulsante e crea la tua passkey: niente password, usi Face ID, Touch ID o una chiavetta.</p>
    <p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1c1917;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:500">Accedi a Dimmelo</a></p>
    <p style="margin:0;font-size:13px;color:#78716c">Il link vale una sola volta, fino al ${until}. Se non hai chiesto tu questo accesso, ignora questa email: senza il link nessuno può entrare.</p>
  </div>
</body></html>`;
  return { text, html };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
