import type { InviteDto } from '../auth/dto.js';
import type { MailMessage } from './mailer.js';

export interface InviteMailInput {
  invite: InviteDto;
  /** Nome di chi riceve l'invito. */
  name: string;
  email: string;
  /** Nome di chi invita. */
  inviter: string;
  /** URL pubblico di Dimmelo. */
  appUrl: string;
}

/** Email d'invito a Dimmelo: passkey da creare (link monouso) o accesso con l'account che ha già. */
export function inviteMail(input: InviteMailInput): MailMessage {
  const { invite, name, inviter, appUrl } = input;
  const passkey = invite.kind === 'passkey';
  const subject = `${inviter} ti ha invitato su Dimmelo`;
  const intro = `${inviter} ti ha dato accesso a Dimmelo, la chat che risponde alle domande sul Palio di Siena.`;
  const steps = passkey
    ? [
        'Per entrare crea la tua passkey: usi Face ID, Touch ID o lo sblocco del telefono, senza password da ricordare.',
        'Il link vale una sola volta e scade presto: se non funziona più, chiedi un nuovo invito.',
      ]
    : ['Hai già un account: entra con la tua passkey o con Google, come fai di solito.'];
  const button = passkey ? 'Crea la passkey ed entra' : 'Entra in Dimmelo';
  const googleHint = passkey
    ? `Se usi Google con questo indirizzo email, puoi anche entrare direttamente con Google da ${appUrl}.`
    : '';

  const text = [
    `Ciao ${name},`,
    '',
    intro,
    '',
    ...steps,
    '',
    `${button}: ${invite.url}`,
    ...(googleHint ? ['', googleHint] : []),
    '',
    'Se non ti aspettavi questa email, puoi ignorarla.',
  ].join('\n');

  const paragraph = (content: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#44403c">${content}</p>`;
  const html = `<!doctype html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fafaf9">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px">
<tr><td style="padding:28px 32px 8px;font-size:22px;font-weight:700;color:#b45309">Dimmelo</td></tr>
<tr><td style="padding:16px 32px 8px">
${paragraph(`Ciao ${escape(name)},`)}
${paragraph(escape(intro))}
${steps.map((s) => paragraph(escape(s))).join('\n')}
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px"><tr>
<td style="border-radius:8px;background:#b45309"><a href="${escape(invite.url)}" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escape(button)}</a></td>
</tr></table>
${googleHint ? paragraph(escape(googleHint)) : ''}
<p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#78716c">Se il pulsante non funziona, copia questo indirizzo nel browser:</p>
<p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all"><a href="${escape(invite.url)}" style="color:#b45309">${escape(invite.url)}</a></p>
</td></tr>
<tr><td style="padding:16px 32px 28px;border-top:1px solid #e7e5e4;font-size:13px;line-height:20px;color:#a8a29e">Se non ti aspettavi questa email, puoi ignorarla.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { to: input.email, subject, html, text };
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
