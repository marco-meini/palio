import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthUser } from '../src/lib/auth/auth-types.js';
import { inviteMail } from '../src/lib/mail/invite-mail.js';
import type { MailMessage, Mailer } from '../src/lib/mail/mailer.js';
import { UsersService } from '../src/lib/users/users-service.js';
import type { ZitadelGrant, ZitadelService } from '../src/lib/zitadel.js';
import type { ModelUsers } from '../src/model/users.model.js';

const actor: AuthUser = {
  id: 1,
  idp_user_id: 'admin',
  display_name: 'Marco Rossi',
  email: null,
  last_login_at: new Date(),
  created_at: new Date(),
  permissions: ['chat.use', 'users.view', 'users.manage'],
};

const grant = (userId: string, email: string): ZitadelGrant => ({
  grantId: `g-${userId}`,
  userId,
  roleKeys: ['chat.use'],
  active: true,
  firstName: 'Bruno',
  lastName: 'Verdi',
  displayName: 'Bruno Verdi',
  email,
  createdAt: '2026-11-27T00:00:00.000Z',
});

/** ZITADEL minimo per gli inviti: un utente con accesso, che sa già entrare o no. */
function zitadelWith(canLogin: boolean): ZitadelService {
  return {
    listGrants: async () => [grant('bruno', 'bruno@example.com')],
    hasLoginMethod: async () => canLogin,
    passkeyRegistrationLink: async (id: string) => `https://app.example.com/api/auth/invito?userId=${id}&code=x`,
  } as unknown as ZitadelService;
}

const repository = { lastLogins: async () => new Map() } as unknown as ModelUsers;

class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  constructor(private readonly fail = false) {}
  async send(message: MailMessage): Promise<void> {
    if (this.fail) throw new Error('SMTP non raggiungibile');
    this.sent.push(message);
  }
}

describe('Email d\'invito', () => {
  it('passkey: email a chi è invitato con il link monouso', async () => {
    const mailer = new FakeMailer();
    const service = new UsersService(zitadelWith(false), repository, 'https://app.example.com', mailer);
    const invite = await service.invite('bruno', actor);
    assert.deepEqual(invite.mail, { to: 'bruno@example.com', sent: true });
    const [mail] = mailer.sent;
    assert.equal(mail?.to, 'bruno@example.com');
    assert.equal(mail?.subject, 'Marco Rossi ti ha invitato su Dimmelo');
    assert.ok(mail?.html.includes('href="https://app.example.com/api/auth/invito?userId=bruno&amp;code=x"'));
    assert.ok(mail?.text.includes('https://app.example.com/api/auth/invito?userId=bruno&code=x'));
    assert.match(mail!.text, /Crea la passkey ed entra/);
  });

  it('login: chi sa già entrare riceve il link di Dimmelo', async () => {
    const mailer = new FakeMailer();
    const service = new UsersService(zitadelWith(true), repository, 'https://app.example.com', mailer);
    const invite = await service.invite('bruno', actor);
    assert.equal(invite.kind, 'login');
    assert.match(mailer.sent[0]!.text, /Entra in Dimmelo: https:\/\/app\.example\.com/);
  });

  it('invio non riuscito: l\'invito resta valido, con l\'esito', async () => {
    const service = new UsersService(zitadelWith(false), repository, 'https://app.example.com', new FakeMailer(true));
    const invite = await service.invite('bruno', actor);
    assert.equal(invite.kind, 'passkey');
    assert.deepEqual(invite.mail, { to: 'bruno@example.com', sent: false });
  });

  it('senza invio configurato: solo il link', async () => {
    const service = new UsersService(zitadelWith(false), repository, 'https://app.example.com');
    const invite = await service.invite('bruno', actor);
    assert.equal(invite.mail, undefined);
  });

  it('il template non inserisce HTML dai nomi', () => {
    const mail = inviteMail({
      invite: { kind: 'login', url: 'https://app.example.com' },
      name: '<b>Bruno</b>',
      email: 'bruno@example.com',
      inviter: 'Marco "M" Rossi',
      appUrl: 'https://app.example.com',
    });
    assert.ok(!mail.html.includes('<b>Bruno</b>'));
    assert.ok(mail.html.includes('&lt;b&gt;Bruno&lt;/b&gt;'));
    assert.ok(mail.html.includes('Marco &quot;M&quot; Rossi'));
  });
});
