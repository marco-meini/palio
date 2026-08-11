# palio

Database e import dati dal [Palio di Siena](https://www.ilpalio.siena.it/), più **Dimmelo**: interfaccia Angular che interroga il database in sola lettura tramite un assistente Claude.

## Dimmelo (Angular + API)

Chat locale per domande su edizioni, contrade, cavalli e risultati. Il backend usa la skill Postgres (`scripts/postgres`) in **sola lettura** — nessun INSERT/UPDATE/DELETE esposto all'assistente.

### Prerequisiti

- Node.js 20+
- Postgres con dati Palio
- File `.env` nella root del repo (copia da `.env.example`)

### Setup

```bash
npm install
cd server && npm install
cd client && npm install

cp .env.example .env
# Modifica .env: DATABASE_URL, ANTHROPIC_API_KEY, auth se serve
```

Variabili principali (elenco completo in [`.env.example`](.env.example)):

| Variabile | Dev tipico | Descrizione |
|-----------|------------|-------------|
| `DATABASE_URL` | `postgresql://...@127.0.0.1:5432/palio` | Pool API / scraper / auth |
| `CHAT_DATABASE_URL` | (opzionale) | Pool read-only chat (`palio_chat_ro`) |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Obbligatoria per la chat |
| `AUTH_ENABLED` | `false` | `true` in produzione |
| `CORS_ORIGIN` | `http://localhost:4200` | Origine Angular dev |
| `SERVER_PORT` | `3001` | Porta API |

Produzione: stesse chiavi in `.env.production` (vedi [`.env.production.example`](.env.production.example)).

### Avvio in sviluppo

```bash
# Dalla root — API + frontend insieme
npm install
npm run dev

# Oppure separatamente:
npm run dev:api   # http://localhost:3001
npm run dev:client    # http://localhost:4200 (proxy /api → 3001)
```

Verifica API:

```bash
curl http://localhost:3001/api/health
# {"ok":true,"db":"Connection OK (profile: local)"}
```

Apri [http://localhost:4200](http://localhost:4200) e prova domande come:

- *Quali cavalli hanno corso in due palii consecutivi in anni diversi?*
- *Quante vittorie ha l'Aquila negli anni '90?*

### Test

```bash
cd server && npm test          # parser + guardrail SQL read-only + auth
cd client && npm run build     # build Angular
```

### Autenticazione Google (OAuth)

Dimmelo può richiedere login Google prima di chiamare `POST /api/chat`. Il backend gestisce l’OAuth Authorization Code, emette un cookie di sessione **httpOnly** (JWT firmato con `jose`) e controlla che l’email sia presente in Postgres (`dimmelo_users`).

In sviluppo locale, lascia `AUTH_ENABLED=false` in `.env` per usare la chat senza configurare Google.

#### Google Cloud Console

1. Crea o seleziona un progetto → **APIs & Services** → **OAuth consent screen** (External; aggiungi test users se l’app è in testing).
2. **Credentials** → **Create credentials** → **OAuth 2.0 Client ID** → tipo **Web application**.
3. **Authorized redirect URIs**:
   - Dev: `http://localhost:3001/api/auth/google/callback`
   - Prod: `https://<tuo-dominio>/api/auth/google/callback` (stesso host del proxy API)
4. Credenziali OAuth (scegli una opzione):
   - **Variabili `.env`:** `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`
   - **File JSON:** copia in `server/config/google-oauth.json` e imposta `GOOGLE_OAUTH_JSON_PATH`
5. Genera un segreto sessione: `openssl rand -base64 48` → `AUTH_SESSION_SECRET` in `.env`.
6. Applica la migration utenti e aggiungi account autorizzati (vedi sotto **Utenti Dimmelo**).
   - Deve essere l’**email principale del profilo Google** usato al login.
   - Se vedi *«account Google non è autorizzato»* con `Account usato: nome@***`, verifica su [account.google.com](https://myaccount.google.com) l’email e inseriscila in `dimmelo_users`.

#### Utenti Dimmelo (`dimmelo_users`)

Migration: [`db/migrations/dimmelo_users.sql`](db/migrations/dimmelo_users.sql) (include seed per `marco.meini.1979@gmail.com` / display name `Marco`).

```bash
# Esempio con psql (adatta host/db/user)
psql -h 127.0.0.1 -U postgres -d app -f db/migrations/dimmelo_users.sql
```

Aggiungere un utente autorizzato:

```sql
INSERT INTO dimmelo_users (email, display_name)
VALUES ('nome.cognome@gmail.com', 'Nome')
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name;
```

L’email va in **minuscolo** (vincolo `CHECK`). Il `display_name` compare nell’header chat (`GET /api/auth/me` → `name`).

#### Deploy produzione (Docker + Caddy)

Produzione prevista su **`https://dimmelo.marcomeini.it`** (Caddy sul VPS, container FE/BE, Postgres in container Docker sulla rete `postgres`).

**Prerequisiti VPS:** Docker, rete `postgres` con container DB collegato, DB `palio` ripristinato ([`docker/restore-palio-local.sh`](docker/restore-palio-local.sh)), migration [`dimmelo_users.sql`](db/migrations/dimmelo_users.sql).

1. Copia il progetto sul server (es. `~/palio`).
2. Configura ambiente:
   ```bash
   cp .env.production.example .env.production
   # DATABASE_URL=postgresql://postgres:PASSWORD@postgres:5432/palio
   # AUTH_*, ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID/SECRET (o volume google-oauth.json)
   ```
3. Abilita pgvector e crea la tabella regolamento (una tantum), poi indicizza il PDF:
   ```bash
   psql "$DATABASE_URL" -f db/bootstrap/03_pgvector.sql
   psql "$DATABASE_URL" -f db/migrations/released/regolamento_chunks.sql
   cd server && npm run index-regolamento
   ```
4. Avvia stack (FE su `127.0.0.1:8080`, BE solo rete interna):
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```
   Lo script esegue sempre `git pull` prima del build. Tag immagini dal campo `version` di `package.json` (override: `--version` o `IMAGE_TAG`). Opzioni: `--skip-build`, `--skip-health`.
5. Caddy — al primo deploy aggiungi il blocco in [`docker/caddy-dimmelo.snippet`](docker/caddy-dimmelo.snippet) a `/etc/caddy/Caddyfile` (con sudo). `./deploy.sh` ricarica Caddy automaticamente (`sudo systemctl reload caddy`) a ogni run.
6. Google OAuth redirect URI: `https://dimmelo.marcomeini.it/api/auth/google/callback`
7. Verifica: `curl -s https://dimmelo.marcomeini.it/api/health`

In Docker il backend usa **`DATABASE_URL`** da `.env.production`. In dev: `.env` nella root del repo.

**Portainer dietro Caddy:** se compare `Forbidden - origin invalid`, imposta `TRUSTED_ORIGINS=portainer.marcomeini.it` sul container Portainer e inoltra `Host` / `X-Forwarded-Proto` nel proxy Caddy.

#### Deploy pubblico (HTTPS) — note

- `AUTH_PUBLIC_APP_URL` e `AUTH_PUBLIC_API_URL` = `https://dimmelo.marcomeini.it` (stesso host; il FE nginx inoltra `/api` al BE).
- `CORS_ORIGIN` = stesso URL.
- Non esporre Postgres su Internet. Binding host: **`127.0.0.1:9634→5432`** (rete Docker `postgres` per l’app). Dettagli e runbook: [`docker/harden-postgres.md`](docker/harden-postgres.md).
- Dev locale verso il DB sul VPS: tunnel SSH [`docker/ssh-tunnel-db.sh`](docker/ssh-tunnel-db.sh), poi `DATABASE_URL` / skill profile su `127.0.0.1:9634`.

Route auth:

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/api/auth/google` | Avvia login Google |
| GET | `/api/auth/google/callback` | Callback OAuth (redirect interno) |
| GET | `/api/auth/logout` | Cancella cookie sessione |
| GET | `/api/auth/me` | `{ email, name, authEnabled }` per l’UI |

`GET /api/health` resta pubblico (monitoring).

## Database

- Bootstrap istanza: [`db/bootstrap/`](db/bootstrap/)
- Schema iniziale contrade: [`db/dumps/initial_palio_schema.sql`](db/dumps/initial_palio_schema.sql)
- Migration in sospeso: [`db/migrations/prerelease.sql`](db/migrations/prerelease.sql)

Config Postgres locale (non versionata): `.skills/postgres/config.toml`

### Applicare la migration pending

```bash
export DB_PROJECT_ROOT="$PWD"
export POSTGRES_CLI="$HOME/.agents/skills/postgres/scripts/postgres"
export DB_PROFILE=local

"$POSTGRES_CLI" profile test
"$POSTGRES_CLI" query run -f db/migrations/prerelease.sql
```

Se il DB aveva già la colonna `ordine`, lo script la rinomina in `canape`.

### Rilasciare la migration (dopo conferma)

```bash
"$POSTGRES_CLI" migration release --summary "Add palii and partecipazioni schema"
```

## Import da ilpalio.siena.it

Workflow completo (singolo Palio, intervallo date, validazione): skill agent
[`.cursor/skills/scrape-ilpalio/`](.cursor/skills/scrape-ilpalio/).

Per ogni Palio lo scraper effettua **sette richieste**:

1. **Sommario** (`/5/Palio/{codice}`) — data, straordinario, vincitrice (contrada vincente e fantino con nome completo)
2. **Ingresso al canape** (`/5/Palio/{codice}/ingresso-canape`) — tutte le contrade con **cavallo**, **fantino** e posto al canape
3. **Dirigenze** (`/5/Palio/{codice}/dirigenze`) — per ogni contrada al canape: capitano, priore (o governatore/rettore), mangini, barbaresco (tutte le partecipazioni, non solo la vincitrice)
4. **Ordine di estrazione** (`/5/Palio/{codice}/ordine-estrazione`) — ordine di estrazione (1–10), flag `estratta` e eventuale «estratta da [contrada]» (solo sulle righe già importate dal canape; la sezione «Le altre sette» non crea righe)
5. **Assegnazione cavalli** (`/5/Palio/{codice}/assegnazione-cavalli`) — ordine in tratta, numeri orecchio/coscia, proprietario e «preso da» (merge sulle righe canape, come ordine-estrazione)
6. **Ordine di arrivo** (`/5/Palio/{codice}/ordine-arrivo`) — posizione in arrivo (1°, 2°, …; merge sulle righe canape; solo i piazzati elencati sul sito)
7. **Cadute** (`/5/Palio/{codice}/cadute`) — giro di caduta 1–3 (`giro_caduta`; `NULL` se non caduta; merge sulle righe canape)

Il crawl segue il link «Palio precedente» sulla pagina ingresso-canape.

```bash
cd server
npm install
node tasks/scrape-ilpalio.js \
  --start https://www.ilpalio.siena.it/5/Palio/202507020/ingresso-canape \
  --max 20 \
  --delay-ms 800
```

Opzioni principali: `--source-code`, `--until-date`, `--fail-fast`, `--delay-ms`.
Vedi `node tasks/scrape-ilpalio.js --help` e la skill sopra.

Usa il profilo in `.skills/postgres/config.toml` oppure `DATABASE_URL`.

### Colonne `canape` e `non_partecipa`

In `palio_partecipazioni.canape` (smallint):

| Valore | Significato |
|--------|-------------|
| 1–9 | Posto di ingresso al canape |
| 10 | Rincorsa (`R` sul sito, tipicamente Valdimontone) |
| NULL | Con `non_partecipa = true` (contrada non corre, etichetta `N.P.` sul sito) |

`non_partecipa` (boolean, default `false`): quando la contrada è in busta ma non partecipa alla corsa, il sito mostra `N.P.` al posto del numero di canape; in DB restano `canape`, `cavallo_id` e `fantino_id` NULL.

### Colonne `ordine`, `estratta`, `estratta_da_id`

Da `/ordine-estrazione` (blocco «Estrazione di …», non «Le altre sette»):

| Colonna | Significato |
|---------|-------------|
| `ordine` | Posizione nell’estrazione (1–10 sul canape); distinto da `canape` |
| `estratta` | `true` se il sito mostra la riga «estratta da …» (incluso Sindaco; vedi `estratta_da_id`) |
| `estratta_da_id` | FK su `contrade` quando il sito indica «estratta da [nome contrada]»; **NULL** se la riga manca, se il testo è «estratta da Sindaco», o se la contrada estrattrice non è risolvibile |

Se la pagina ordine-estrazione non è disponibile o il parse fallisce, l’import prosegue con `ordine` NULL e `estratta` false (warning su stderr), salvo `--fail-fast`.

### Colonne `ordine_assegnazione`, `orecchio`, `coscia`, `proprietario_cavallo`, `cavallo_preso_da`

Da `/assegnazione-cavalli` (tabella `.RigaTabCavalli`, 10 righe al canape):

| Colonna | Significato |
|---------|-------------|
| `ordine_assegnazione` | Ordine di assegnazione in tratta (1–10) |
| `orecchio` | Numero orecchio (`.NumeriCavallo.Orecchio`) |
| `coscia` | Numero coscia (`.NumeriCavallo.Coscia`) |
| `proprietario_cavallo` | Proprietario del cavallo |
| `cavallo_preso_da` | Persona che ha «preso» il cavallo per la contrada |

Se la pagina assegnazione-cavalli non è disponibile o il parse fallisce, l’import prosegue con queste colonne NULL (warning su stderr), salvo `--fail-fast`. Righe `non_partecipa` non ricevono dati tratta.

### Colonna `ordine_arrivo`

Da `/ordine-arrivo` (`.ContradaBox` in `#sezPrincipale`, etichetta `1°`, `2°`, …):

| Colonna | Significato |
|---------|-------------|
| `ordine_arrivo` | Posizione in arrivo (1, 2, 3, 4, …) |

Il sito elenca spesso solo i primi classificati; le altre contrade restano con `ordine_arrivo` NULL. Se la pagina non è disponibile o il parse fallisce, l’import prosegue con NULL (warning su stderr), salvo `--fail-fast`. Righe `non_partecipa` non ricevono posizione in arrivo.

### Colonna `giro_caduta`

Da `/cadute` (sezioni `.Corniciato` con h4 Primo/Secondo/Terzo giro e box `.ContradaCaduta`):

| Colonna | Significato |
|---------|-------------|
| `giro_caduta` | Giro di caduta (**1**–**3**); **NULL** se non caduta |

Se la stessa contrada compare due volte (anomalo), resta il giro minore. Luogo della caduta (S. Martino / Casato) non è importato. Soft-fail come le altre pagine post-canape; `non_partecipa` → NULL.

### Colonne `capitano_id`, `priore_id`, `barbaresco_id` e mangini

Da `/dirigenze` (`.Corniciato.Riquadro` per contrada, codice da `DC(...)` sulla bandiera):

| Colonna / tabella | Significato |
|-------------------|-------------|
| `capitano_id` | Capitano di contrada |
| `priore_id` | Priore, oppure governatore (Oca) o rettore (Bruco) |
| `barbaresco_id` | Barbaresco |
| `palio_partecipazione_mangini` | Elenco mangini con `ordine` 0…n−1 |

Valori applicati a **ogni** riga in `palio_partecipazioni` creata dal canape (inclusa la vincitrice e le contrade `N.P.`). Il sommario «Vinto da» non alimenta più lo staff.

Se la pagina dirigenze non è disponibile o il parse fallisce, capitano/priore/barbaresco e mangini restano vuoti (warning su stderr), salvo `--fail-fast`.

Test parser: `cd server && npm test` (fixture `test/fixtures/ordine-arrivo-202507020.html`, `test/fixtures/cadute-202607020.html`, `test/fixtures/dirigenze-202507020.html`).

### Validazione rapida

```bash
"$POSTGRES_CLI" query run -c "
SELECT c.name, pp.canape, pp.ordine, pp.estratta, ed.name AS estratta_da,
       ca.nome AS cavallo, f.soprannome AS fantino, pp.vincitrice
FROM palii p
JOIN palio_partecipazioni pp ON pp.palio_id = p.id
JOIN contrade c ON c.id = pp.contrada_id
LEFT JOIN contrade ed ON ed.id = pp.estratta_da_id
LEFT JOIN cavalli ca ON ca.id = pp.cavallo_id
LEFT JOIN fantini f ON f.id = pp.fantino_id
WHERE p.source_code = '201708160'
ORDER BY pp.ordine;
"
```

Esempio Palio 2017 (`201708160`): Lupa `ordine=8`, `estratta=true`, `estratta_da` → Istrice; Onda `ordine=7`, `estratta_da` NULL; Aquila `estratta_da` → Giraffa.

Assegnazione cavalli (Palio 2025, `202507020`):

```bash
"$POSTGRES_CLI" query run -c "
SELECT c.name, pp.ordine_assegnazione, pp.orecchio, pp.coscia,
       pp.proprietario_cavallo, pp.cavallo_preso_da, ca.nome AS cavallo
FROM palii p
JOIN palio_partecipazioni pp ON pp.palio_id = p.id
JOIN contrade c ON c.id = pp.contrada_id
LEFT JOIN cavalli ca ON ca.id = pp.cavallo_id
WHERE p.source_code = '202507020'
  AND NOT pp.non_partecipa
ORDER BY pp.ordine_assegnazione;
"
```

Esempio: Tartuca `ordine_assegnazione=1`, `coscia=31`, `orecchio=8`, proprietario Enrico Bruschelli, preso da Gabriele Romaldo (il Brilla).

Ordine di arrivo (stesso Palio `202507020`):

```bash
"$POSTGRES_CLI" query run -c "
SELECT c.name, pp.ordine_arrivo, ca.nome AS cavallo, f.soprannome AS fantino
FROM palii p
JOIN palio_partecipazioni pp ON pp.palio_id = p.id
JOIN contrade c ON c.id = pp.contrada_id
LEFT JOIN cavalli ca ON ca.id = pp.cavallo_id
LEFT JOIN fantini f ON f.id = pp.fantino_id
WHERE p.source_code = '202507020'
  AND NOT pp.non_partecipa
ORDER BY pp.ordine_arrivo NULLS LAST, pp.canape;
"
```

Esempio: Oca `ordine_arrivo=1`, Bruco `2`, Selva `3`, Valdimontone `4`; le altre contrade al canape con `ordine_arrivo` NULL.

## Dimmelo (AI + database)

Web app in [`client/`](client/) per interrogare il database in linguaggio naturale. Il backend ([`server/src/`](server/src/)) usa **Claude** (Anthropic) con tool che invocano la skill Postgres (`scripts/postgres`) in **sola lettura**.

### Prerequisiti

- Database Palio popolato
- `.env` nella root (copia da `.env.example`) con `DATABASE_URL` e `ANTHROPIC_API_KEY`

### Avvio in sviluppo

```bash
cp .env.example .env
# imposta DATABASE_URL e ANTHROPIC_API_KEY in .env

npm install
cd server && npm install
cd ../client && npm install

npm run dev
```

Oppure due terminali: `npm run dev:api` e `npm run dev:client`.

- UI: http://localhost:4200  
- Health: http://localhost:3001/api/health  

### Regolamento (RAG)

Dimmelo può rispondere anche su **regole e regolamento ufficiale** tramite il tool `search_regolamento`, che interroga chunk vettoriali in Postgres (**pgvector**) generati dal PDF in [`server/doc/Regolamento per il Palio.pdf`](server/doc/Regolamento%20per%20il%20Palio.pdf).

**Prerequisiti DB** (una tantum, come superuser):

```bash
psql -h … -U postgres -d palio -f db/bootstrap/03_pgvector.sql
psql -h … -U postgres -d palio -f db/migrations/released/regolamento_chunks.sql
```

Dopo aver aggiornato il PDF (o al primo setup):

```bash
cd server && npm run index-regolamento
```

Lo script estrae il testo (OCR se il PDF è scansionato; richiede **poppler**: `brew install poppler`), calcola gli embedding locali e scrive i chunk in `regolamento_chunks`.

Opzioni in `.env`: `REGOLAMENTO_TOP_K`, `REGOLAMENTO_MIN_SCORE`.

### Stack

| Parte | Tecnologie |
|-------|------------|
| Frontend | Angular 21, Tailwind CSS 4, UI stile Spartan/shadcn (Tailwind) |
| Backend | Fastify, Vercel AI SDK, `@ai-sdk/anthropic` |
| DB | Postgres skill CLI (`query run`, `schema inspect`, `query find`) |
| Regolamento | Embedding locali (`@xenova/transformers`), pgvector su Postgres, OCR (`tesseract.js` + `pdftoppm`) |

Per aggiungere componenti [Spartan-ng](https://www.spartan.ng) in seguito: `cd client && npx @spartan-ng/cli init` (richiede rete/registry).

### Sicurezza

La chat non può eseguire `INSERT`, `UPDATE`, `DELETE`, DDL o migration: solo `SELECT` / `WITH` / `EXPLAIN`.

Con `auth.enabled: true`, solo le email in `dimmelo_users` possono avviare richieste chat (cookie httpOnly; nessun token Google nel browser). In produzione usa sempre HTTPS e `auth.enabled: true`.
