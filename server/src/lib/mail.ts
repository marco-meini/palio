import { createTransport, type Transporter } from 'nodemailer';
import type { AuthConfig } from '../auth-config.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Invio email via SMTP (configurazione `SMTP_*`). */
export class MailService {
  private transporter?: Transporter;

  constructor(private readonly config: AuthConfig) {}

  async send(message: MailMessage): Promise<void> {
    const mail = this.config.mail;
    if (!mail) {
      console.warn(`[mail] Email non inviata (SMTP_HOST non configurato): "${message.subject}"`);
      if (!this.config.secureCookies) {
        // solo in sviluppo (http): il testo nel log permette di provare il flusso senza SMTP
        console.warn(`[mail] [sviluppo] a ${message.to}:\n${message.text}`);
      }
      return;
    }
    this.transporter ??= createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: mail.user ? { user: mail.user, pass: mail.password } : undefined,
    });
    await this.transporter.sendMail({ from: mail.from, ...message });
  }
}
