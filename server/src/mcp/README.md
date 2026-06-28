# Configurazione unificata via `.env`

Dev e prod usano **le stesse variabili**. Cambia solo il file:

| Ambiente | File | Come crearlo |
|----------|------|--------------|
| Dev | `.env` | `cp .env.example .env` |
| Prod (Docker) | `.env.production` | `cp .env.production.example .env.production` |

Variabili obbligatorie minime in dev:

```bash
DATABASE_URL=postgresql://postgres:password@host:5432/palio
ANTHROPIC_API_KEY=sk-ant-...
```

Consigliato per il chat in prod:

```bash
CHAT_DATABASE_URL=postgresql://palio_chat_ro:...@postgres:5432/palio
```

Vedi [`.env.example`](../../.env.example) per l'elenco completo.
