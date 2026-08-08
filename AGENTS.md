# AGENTS.md — Palio / Dimmelo

Istruzioni per agenti AI che lavorano su questo repository. Preferire questo file e le skill in `.cursor/skills/` rispetto a ipotesi generiche.

## Cos’è

Monorepo per:

1. **Database Palio** — schema Postgres e import da [ilpalio.siena.it](https://www.ilpalio.siena.it/)
2. **Dimmelo** — chat Angular che interroga il DB in **sola lettura** via Claude (Anthropic) + tool SQL/RAG

Documentazione umana: `README.md`. Non duplicare runbook lunghi qui; punta ai path giusti.

## Layout

| Path | Ruolo |
|------|--------|
| `client/` | Angular 21 (standalone) + Tailwind 4 — UI Dimmelo |
| `server/` | API Express 5 + scraper + chat agent + MCP |
| `db/bootstrap/` | Bootstrap istanza / pgvector |
| `db/migrations/` | SQL pending (`prerelease.sql`, file isolati) e `released/` |
| `db/dumps/` | Schema/dump iniziali |
| `docker/`, `deploy.sh` | Deploy VPS (Caddy, container FE/BE) |
| `.cursor/skills/` | Skill operative (es. scrape) |
| `.env` | Segreti locali (mai commitare); template: `.env.example` |

Root `package.json`: orchestrazione `dev` / `dev:api` / `dev:client`. Dipendenze app in `server/` e `client/`.

## Comandi essenziali

```bash
# Dev (root)
npm install && cd server && npm install && cd ../client && npm install
cp .env.example .env   # poi DATABASE_URL, ANTHROPIC_API_KEY, …
npm run dev            # API :3001 + Angular :4200

# Test / build
cd server && npm test
cd client && npm run build

# Scrape (skill dedicata)
# .cursor/skills/scrape-ilpalio/SKILL.md

# Regolamento RAG (dopo pgvector + migration)
cd server && npm run index-regolamento
```

## Stack reale (fonte di verità = codice)

- **Backend**: Express 5, TypeScript (`NodeNext`, ESM), `tsx` in dev, Vercel AI SDK + `@ai-sdk/anthropic`, `pg`, Cheerio, Zod
- **Frontend**: Angular 21 standalone, signals, Tailwind 4, `marked` + DOMPurify
- **DB**: Postgres; chat preferisce utente read-only (`CHAT_DATABASE_URL` / `palio_chat_ro`)
- **Auth**: Google OAuth Authorization Code, cookie httpOnly JWT (`jose`), allowlist `dimmelo_users`

Nota: il README può citare Fastify storicamente — il server è **Express**.

---

## Convenzioni server (`server/src/`)

### Struttura

- `controllers/*.controller.ts` — route Express; estendono `Abstract_Controller`
- `lib/` — logica riusabile (chat, auth, parser, pg, RAG)
- `model/*.model.ts` — accesso dati Postgres (`ModelX`)
- `tasks/` — CLI one-shot (scrape, index regolamento); non route HTTP
- `mcp/` — server MCP sidecar DB

### Moduli e naming

- `"type": "module"`: import relativi con suffisso **`.js`** anche da file `.ts`  
  (`import { X } from './foo.js'`)
- File: `kebab-case.ts` (`chat-agent.ts`, `pg-readonly-driver.ts`)
- Classi controller: `SomethingController`; modelli: `ModelSomething`
- Config runtime: `Environment` + `config.ts` / `load-env.ts` (`.env` nella **root** del repo)

### Chat e sicurezza SQL (inviolabile)

- Tool chat/MCP: **solo** `SELECT` / `WITH` / `EXPLAIN` — enforced da `assertReadOnlySql` in `lib/postgres-cli.ts`
- Nessun INSERT/UPDATE/DELETE/DDL esposto all’assistente
- Scrivere/modificare dati solo via scraper, task espliciti, o migration SQL — mai “aiutare” la chat a scrivere
- Preferire `CHAT_DATABASE_URL` (ruolo RO); non indebolire i guardrail per “comodità”
- Errori utente in italiano quando possibile; rate-limit Anthropic: messaggio chiaro (vedi `chat.controller.ts`)

### Scraper / parser

- Import Palio: **sei pagine** per edizione (sommario, ingresso-canape, dirigenze, ordine-estrazione, assegnazione-cavalli, ordine-arrivo) — skill `scrape-ilpalio`
- Parser in `lib/ilpalio-parser.ts`; test con fixture HTML in `server/test/fixtures/`
- Dominio: `canape` ≠ `ordine` (estrazione) ≠ `ordine_assegnazione` ≠ `ordine_arrivo`; `canape=10` = rincorsa; `non_partecipa` = N.P.
- Rispettare `--delay-ms` verso il sito; non martellare il source

### Test

- Node test runner: `cd server && npm test` → `test/**/*.test.ts`
- Nuova logica di parse/SQL guardrail/auth: aggiungere test; riusare fixture HTML dove possibile

---

## Convenzioni client (`client/src/`)

- Standalone components, **signals** (`signal`, `computed`), `inject()`
- Feature folders: `app/features/<feature>/`, shared in `app/core/` (services, guards, utils)
- Template inline o file collocati al componente; stili Tailwind utility-first
- Markdown assistente: `core/utils/markdown.ts` (sanitizzato) — non renderizzare HTML grezzo dalla API
- Proxy `/api` → backend in dev; non hardcodare host di produzione nell’UI
- Auth: cookie sessione cross-origin con `credentials`; rispettare `AUTH_ENABLED`

UI esistente: palette ambrata/stone. Nuove schermate: allinearsi al look Dimmelo, non inventare un design system parallelo.

---

## Database e migration

- Pending: `db/migrations/prerelease.sql` o file dedicati; changelog in `db/migrations/CHANGELOG.md`
- Released: `db/migrations/released/`
- Bootstrap: `db/bootstrap/` (istanza, DB, pgvector)
- Config skill Postgres (non versionata): `.skills/postgres/config.toml`, profile tipico `local`
- Email in `dimmelo_users`: **minuscolo** (CHECK)
- Non esporre Postgres su Internet; in prod binding/host hardening documentati in `docker/harden-postgres.md`

Prima di alterare schema: leggere CHANGELOG e colonne domain-specific sopra; non rinominare `canape`/`ordine` senza aggiornare scraper, chat knowledge e test.

---

## Env e deploy

- Dev: `.env` root (da `.env.example`)
- Prod: `.env.production` (da `.env.production.example`); deploy con `./deploy.sh`
- Non commitare `.env`, `google-oauth.json`, dump con dati sensibili
- `AUTH_ENABLED=true` in produzione; health pubblico, chat protetta

### VPS — divieto assoluto senza richiesta esplicita

**NON eseguire MAI azioni sul VPS** (SSH, `scp`, `rsync`, `git pull`/`reset` remoto, `docker compose`, `deploy.sh`, modifica `.env.production`, restart container, ecc.) **a meno che l’utente non lo chieda esplicitamente in quel messaggio**.

- Un log di errore da un terminale SSH, un paste di `git pull` fallito, o “guarda questo errore” **non** sono un’autorizzazione a intervenire sul server.
- In quei casi: spiegare la causa e proporre i comandi da far girare **all’utente**; non lanciarli tu sul VPS.
- Vale anche se in chat precedenti hai già avuto accesso SSH o hai deployato: ogni volta serve il via libera esplicito.

---

## Skill e quando usarle

| Skill | Quando |
|-------|--------|
| `.cursor/skills/scrape-ilpalio/` | scrape / import / backfill da ilpalio.siena.it |
| Skill Postgres dell’utente (`~/.agents/skills/postgres`) | query diagnostiche, migration release — con profile appropriato |

Per scrape: seguire la skill (non reinventare CLI o URL).

---

## Principi di lavoro

1. **Minimo diff**: solo ciò che serve al task; niente refactor estetici o doc non richiesti
2. **Sicurezza chat**: read-only è un requisito di prodotto, non un dettaglio implementativo
3. **Fonte di verità**: codice + test + `AGENTS.md` / skill; correggere README se diverge (es. Express vs Fastify) quando si tocca quell’area
4. **Lingua**: messaggi UI/API verso utente in italiano; codice/identifier in inglese (o termini di dominio italiani già consolidati: `canape`, `contrade`, `palii`)
5. **Commit/PR**: solo se richiesti esplicitamente dall’utente
6. **Segreti**: mai loggare API key, session secret, password DB
7. **VPS**: nessuna azione sul server di produzione senza richiesta esplicita (vedi sezione Env e deploy)

## Anti-pattern

- Esporre DML/DDL ai tool della chat o rimuovere `assertReadOnlySql`
- Scraping senza delay / senza usare `tasks/scrape-ilpalio.ts`
- Import ESM senza estensione `.js`
- Nuovi componenti Angular non-standalone o NgModule legacy
- Migration applicate “a mano” senza aggiornare CHANGELOG / released quando si rilascia
- Hardcoded URL produzione nel client al posto di env/proxy
- SSH / deploy / git / docker sul VPS “per aiutare” senza che l’utente l’abbia chiesto nero su bianco
