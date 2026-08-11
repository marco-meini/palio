import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChatSystemPrompt,
  DOMAIN_FK_JOINS,
  DOMAIN_SCHEMA,
} from '../src/lib/chat-domain-knowledge.js';

test('buildChatSystemPrompt — documenta anagrafiche dirigenze e JOIN obbligatori', () => {
  const prompt = buildChatSystemPrompt();

  assert.match(prompt, /capitani\(id, nome\)/);
  assert.match(prompt, /priori\(id, nome\)/);
  assert.match(prompt, /barbareschi\(id, nome\)/);
  assert.match(prompt, /capitano_id → capitani\.id/);
  assert.match(prompt, /JOIN capitani cap ON cap\.id = pp\.capitano_id/);
  assert.match(prompt, /palii_by_person/);
  assert.match(prompt, /Mai.*cercare nomi di persone/i);
  assert.match(prompt, /Alias obbligatori/);
  assert.match(prompt, /pp\.canape/);
  assert.match(prompt, /palii_by_person.*contrada/i);
});

test('DOMAIN_SCHEMA e DOMAIN_FK_JOINS — coerenti con palio_partecipazione_mangini', () => {
  assert.match(DOMAIN_SCHEMA, /palio_partecipazione_mangini/);
  assert.match(DOMAIN_FK_JOINS, /mangini \(N:N\)/);
});

test('buildChatSystemPrompt — documenta giro_caduta', () => {
  const prompt = buildChatSystemPrompt();
  assert.match(DOMAIN_SCHEMA, /giro_caduta/);
  assert.match(prompt, /giro_caduta/);
  assert.match(prompt, /primo giro/i);
});

test('buildChatSystemPrompt — documenta contrada_rivalita', () => {
  const prompt = buildChatSystemPrompt();
  assert.match(DOMAIN_SCHEMA, /contrada_rivalita/);
  assert.match(prompt, /rivalita_contrada/);
  assert.match(prompt, /data_fine IS NULL/);
  assert.match(DOMAIN_FK_JOINS, /contrada_rivalita cr/);
});
