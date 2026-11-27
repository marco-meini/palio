import nodemailer from 'nodemailer';
import type { MailConfig } from '../../auth-config.js';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Invio di email (in produzione via SMTP; nei test un finto). */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export class SmtpMailer implements Mailer {
  private readonly transport;

  constructor(private readonly config: MailConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !config.secure,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.config.from, ...message });
  }
}
