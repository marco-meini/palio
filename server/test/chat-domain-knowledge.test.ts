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

test('buildChatSystemPrompt — documenta prove', () => {
  const prompt = buildChatSystemPrompt();
  assert.match(DOMAIN_SCHEMA, /palio_prove/);
  assert.doesNotMatch(DOMAIN_SCHEMA, /palio_prova_partecipazioni/);
  assert.match(prompt, /Prova Generale/);
  assert.match(prompt, /cambio monta/i);
  assert.match(DOMAIN_FK_JOINS, /prv\.numero/);
});

test('buildChatSystemPrompt — documenta cuffia/nonna', () => {
  const prompt = buildChatSystemPrompt();
  assert.match(DOMAIN_SCHEMA, /contrada_cuffia/);
  assert.match(prompt, /Cuffia.*nonna/i);
  assert.match(prompt, /correva da cuffia/i);
  assert.match(DOMAIN_FK_JOINS, /contrada_cuffia ccu/);
  assert.match(DOMAIN_FK_JOINS, /palio_id_fine IS NULL/);
});

test('buildChatSystemPrompt — documenta pittore_drappellone', () => {
  const prompt = buildChatSystemPrompt();
  assert.match(DOMAIN_SCHEMA, /pittore_drappellone/);
  assert.match(prompt, /Drappellone.*pittore/i);
  assert.match(DOMAIN_FK_JOINS, /p\.pittore_drappellone/);
});

test('buildChatSystemPrompt — rivalità richiedono filtro date sul periodo', () => {
  const prompt = buildChatSystemPrompt();
  assert.match(prompt, /Rivalità \+ date \(obbligatorio\)/);
  assert.match(prompt, /stesso.*periodo di rivalità/i);
  assert.match(DOMAIN_FK_JOINS, /cr\.data_inizio IS NULL OR cr\.data_inizio <= p\.data_palio/);
  assert.match(DOMAIN_FK_JOINS, /LEAST\(pp1\.contrada_id, pp2\.contrada_id\)/);
  assert.match(prompt, /incrociano.*rivalità/i);
});
