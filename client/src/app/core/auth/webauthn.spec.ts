import {
  credentialToJson,
  creationOptions,
  fromBase64url,
  passkeyError,
  requestOptions,
  toBase64url,
} from './webauthn';

const bytes = (buffer: ArrayBuffer | BufferSource) => [...new Uint8Array(buffer as ArrayBuffer)];

describe('webauthn', () => {
  it('base64url andata e ritorno, accetta anche base64 standard', () => {
    const data = new Uint8Array([0, 250, 251, 252, 253, 254, 255, 62, 63]).buffer;
    const encoded = toBase64url(data);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(bytes(fromBase64url(encoded))).toEqual(bytes(data));
    // user.id di ZITADEL arriva in base64 standard con padding
    expect(new TextDecoder().decode(fromBase64url('NDAwNDU3MzU5ODkxMTAzNzQ3'))).toBe(
      '400457359891103747',
    );
  });

  it('converte le opzioni di creazione e di accesso', () => {
    const create = creationOptions({
      challenge: 'AQID',
      rp: { id: 'localhost', name: 'ZITADEL' },
      user: { id: 'BAU', name: 'anna' },
      excludeCredentials: [{ id: 'Bgc', type: 'public-key' }],
    });
    expect(bytes(create.challenge)).toEqual([1, 2, 3]);
    expect(bytes(create.user.id)).toEqual([4, 5]);
    expect(bytes(create.excludeCredentials![0]!.id)).toEqual([6, 7]);
    expect(create.rp.id).toBe('localhost');

    const get = requestOptions({
      challenge: 'AQID',
      rpId: 'localhost',
      allowCredentials: [{ id: 'CA', type: 'public-key' }],
    });
    expect(bytes(get.challenge)).toEqual([1, 2, 3]);
    expect(bytes(get.allowCredentials![0]!.id)).toEqual([8]);
    expect(get.rpId).toBe('localhost');
  });

  it('serializza la risposta del browser', () => {
    const buf = (...b: number[]) => new Uint8Array(b).buffer;
    const assertion = {
      id: 'cred',
      rawId: buf(1),
      type: 'public-key',
      response: {
        clientDataJSON: buf(2),
        authenticatorData: buf(3),
        signature: buf(4),
        userHandle: null,
      },
    } as unknown as PublicKeyCredential;
    expect(credentialToJson(assertion)).toEqual({
      id: 'cred',
      rawId: 'AQ',
      type: 'public-key',
      response: {
        clientDataJSON: 'Ag',
        authenticatorData: 'Aw',
        signature: 'BA',
        userHandle: null,
      },
    });
    const attestation = {
      id: 'cred',
      rawId: buf(1),
      type: 'public-key',
      response: { clientDataJSON: buf(2), attestationObject: buf(5) },
    } as unknown as PublicKeyCredential;
    expect(credentialToJson(attestation).response).toEqual({
      clientDataJSON: 'Ag',
      attestationObject: 'BQ',
    });
  });

  it('messaggi per gli errori del browser', () => {
    expect(passkeyError(new DOMException('x', 'NotAllowedError'))).toContain('annullata');
    expect(passkeyError(new DOMException('x', 'InvalidStateError'))).toContain('già una passkey');
    expect(passkeyError(new Error('altro'))).toBeNull();
  });
});
