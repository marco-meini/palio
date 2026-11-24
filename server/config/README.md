# Configurazione server

**Tutta la configurazione passa da variabili d'ambiente.**

| Ambiente | File |
|----------|------|
| Sviluppo locale | `.env` nella root del repo (copia da [`.env.example`](../../.env.example)) |
| Produzione (Docker) | `.env.production` (copia da [`.env.production.example`](../../.env.production.example)) |

`config.mjs` non è più usato.

Il loader è in [`server/src/load-env.ts`](../src/load-env.ts) + [`server/src/config.ts`](../src/config.ts);
la configurazione dell'autenticazione (passkey/ZITADEL, sessioni, SMTP) in
[`server/src/auth-config.ts`](../src/auth-config.ts), caricata solo dall'API.
