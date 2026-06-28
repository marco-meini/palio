# Configurazione server

**Tutta la configurazione passa da variabili d'ambiente.**

| Ambiente | File |
|----------|------|
| Sviluppo locale | `.env` nella root del repo (copia da [`.env.example`](../../.env.example)) |
| Produzione (Docker) | `.env.production` (copia da [`.env.production.example`](../../.env.production.example)) |

Il loader è in [`server/src/load-env.ts`](../src/load-env.ts) + [`server/src/config.ts`](../src/config.ts).

`config.mjs` non è più usato.

### OAuth Google (opzionale)

Puoi usare variabili `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` nel `.env`, oppure un file JSON:

```bash
cp google-oauth.example.json google-oauth.json
# GOOGLE_OAUTH_JSON_PATH=server/config/google-oauth.json
```
