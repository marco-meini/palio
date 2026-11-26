import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
/**
 * Cifratura dei refresh token salvati in DB (AES-256-GCM). La chiave deriva da COOKIE_SECRET:
 * un dump del database da solo non basta a usarli. Cambiare COOKIE_SECRET li invalida
 * (le sessioni restano finché non serve un refresh, poi l'utente rientra).
 */
export class TokenCrypto {
    key;
    constructor(secret) {
        this.key = createHash('sha256').update(`refresh-token.${secret}`).digest();
    }
    /** `<iv>.<tag>.<ciphertext>`, tutto base64url. */
    encrypt(plain) {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.key, iv);
        const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
        return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
    }
    /** `null` se il valore è manomesso o cifrato con un'altra chiave. */
    decrypt(value) {
        const [iv, tag, data] = value.split('.').map((p) => Buffer.from(p, 'base64url'));
        if (!iv || !tag || !data)
            return null;
        try {
            const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
            decipher.setAuthTag(tag);
            return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
        }
        catch {
            return null;
        }
    }
}
//# sourceMappingURL=token-crypto.js.map