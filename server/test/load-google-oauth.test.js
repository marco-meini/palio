import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  loadGoogleOAuthFromFile,
  mergeGoogleOAuthCredentials,
  parseGoogleOAuthJson,
} from '../config/load-google-oauth.mjs';

test('parseGoogleOAuthJson — formato web Google download', () => {
  const parsed = parseGoogleOAuthJson({
    web: {
      client_id: 'web-id.apps.googleusercontent.com',
      client_secret: 'web-secret',
    },
  });
  assert.deepEqual(parsed, {
    clientId: 'web-id.apps.googleusercontent.com',
    clientSecret: 'web-secret',
  });
});

test('parseGoogleOAuthJson — client_id top-level', () => {
  const parsed = parseGoogleOAuthJson({
    client_id: 'top-id.apps.googleusercontent.com',
    client_secret: 'top-secret',
  });
  assert.deepEqual(parsed, {
    clientId: 'top-id.apps.googleusercontent.com',
    clientSecret: 'top-secret',
  });
});

test('parseGoogleOAuthJson — input invalido', () => {
  assert.equal(parseGoogleOAuthJson(null), null);
  assert.equal(parseGoogleOAuthJson({ web: { client_id: 'only-id' } }), null);
});

test('loadGoogleOAuthFromFile — file mancante', () => {
  assert.equal(
    loadGoogleOAuthFromFile(path.join(os.tmpdir(), 'palio-missing-google-oauth.json')),
    null,
  );
});

test('mergeGoogleOAuthCredentials — config inline ha priorità', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'palio-oauth-'));
  const filePath = path.join(dir, 'google-oauth.json');
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      web: { client_id: 'from-file-id', client_secret: 'from-file-secret' },
    }),
  );

  const merged = mergeGoogleOAuthCredentials(
    { clientId: 'inline-id', clientSecret: '' },
    filePath,
  );
  assert.deepEqual(merged, { clientId: 'inline-id', clientSecret: 'from-file-secret' });

  const allInline = mergeGoogleOAuthCredentials(
    { clientId: 'inline-id', clientSecret: 'inline-secret' },
    filePath,
  );
  assert.deepEqual(allInline, { clientId: 'inline-id', clientSecret: 'inline-secret' });

  fs.rmSync(dir, { recursive: true });
});

test('mergeGoogleOAuthCredentials — carica da file se config vuoto', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'palio-oauth-'));
  const filePath = path.join(dir, 'google-oauth.json');
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      web: { client_id: 'file-only-id', client_secret: 'file-only-secret' },
    }),
  );

  assert.deepEqual(mergeGoogleOAuthCredentials({ clientId: '', clientSecret: '' }, filePath), {
    clientId: 'file-only-id',
    clientSecret: 'file-only-secret',
  });

  fs.rmSync(dir, { recursive: true });
});
