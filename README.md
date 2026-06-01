# palio

Database e import dati dal [Palio di Siena](https://www.ilpalio.siena.it/), più **Palio Chat**: interfaccia Angular che interroga il database in sola lettura tramite un assistente Claude.

## Palio Chat (Angular + API)

Chat locale per domande su edizioni, contrade, cavalli e risultati. Il backend usa la skill Postgres (`scripts/postgres`) in **sola lettura** — nessun INSERT/UPDATE/DELETE esposto all'assistente.

### Prerequisiti

- Node.js 20+
- Postgres locale configurato in `.skills/postgres/config.toml` (non versionato)
- Config backend: `be/config/config.mjs` (non versionato; vedi sotto)

### Setup

```bash
# Backend
cd be && npm install
cp config/config.example.mjs config/config.mjs
# Modifica config.mjs: anthropic.apiKey, db.* se serve

# Frontend
cd fe && npm install
```

Opzioni in [`be/config/config.example.mjs`](be/config/config.example.mjs) (copia in `config.mjs`):

| Chiave | Default | Descrizione |
|--------|---------|-------------|
| `anthropic.apiKey` | — | Obbligatoria per la chat |
| `anthropic.model` | `claude-sonnet-4-20250514` | Modello Claude |
| `postgres.cli` | `~/.agents/skills/postgres/scripts/postgres` | Launcher skill Postgres |
| `postgres.projectRoot` | root repo | Directory con `.skills/postgres/config.toml` |
| `postgres.profile` | `local` | Profilo connessione |
| `server.port` | `3001` | Porta API |
| `server.corsOrigin` | `http://localhost:4200` | Origine Angular dev |
| `db.*` | localhost | Pool pg diretto (task `palio.org`) |

### Avvio in sviluppo

```bash
# Dalla root — API + frontend insieme
npm install
npm run dev

# Oppure separatamente:
npm run dev:api   # http://localhost:3001
npm run dev:fe    # http://localhost:4200 (proxy /api → 3001)
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
cd be && npm test          # parser + guardrail SQL read-only
cd fe && npm run build     # build Angular
```

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

Per ogni Palio lo scraper effettua **sei richieste**:

1. **Sommario** (`/5/Palio/{codice}`) — data, straordinario, vincitrice (contrada vincente e fantino con nome completo)
2. **Ingresso al canape** (`/5/Palio/{codice}/ingresso-canape`) — tutte le contrade con **cavallo**, **fantino** e posto al canape
3. **Dirigenze** (`/5/Palio/{codice}/dirigenze`) — per ogni contrada al canape: capitano, priore (o governatore/rettore), mangini, barbaresco (tutte le partecipazioni, non solo la vincitrice)
4. **Ordine di estrazione** (`/5/Palio/{codice}/ordine-estrazione`) — ordine di estrazione (1–10), flag `estratta` e eventuale «estratta da [contrada]» (solo sulle righe già importate dal canape; la sezione «Le altre sette» non crea righe)
5. **Assegnazione cavalli** (`/5/Palio/{codice}/assegnazione-cavalli`) — ordine in tratta, numeri orecchio/coscia, proprietario e «preso da» (merge sulle righe canape, come ordine-estrazione)
6. **Ordine di arrivo** (`/5/Palio/{codice}/ordine-arrivo`) — posizione in arrivo (1°, 2°, …; merge sulle righe canape; solo i piazzati elencati sul sito)

Il crawl segue il link «Palio precedente» sulla pagina ingresso-canape.

```bash
cd be
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

Test parser: `cd be && npm test` (fixture `test/fixtures/ordine-arrivo-202507020.html`, `test/fixtures/dirigenze-202507020.html`).

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

## Palio Chat (AI + database)

Web app in [`fe/`](fe/) per interrogare il database in linguaggio naturale. Il backend ([`be/server/`](be/server/)) usa **Claude** (Anthropic) con tool che invocano la skill Postgres (`scripts/postgres`) in **sola lettura**.

### Prerequisiti

- Database Palio popolato e profilo in `.skills/postgres/config.toml`
- Skill Postgres installata: `~/.agents/skills/postgres/scripts/postgres`
- `be/config/config.mjs` con `anthropic.apiKey` (copia da [`be/config/config.example.mjs`](be/config/config.example.mjs))

### Avvio in sviluppo

```bash
# dalla root del repo
cp be/config/config.example.mjs be/config/config.mjs
# imposta anthropic.apiKey in be/config/config.mjs

npm install              # concurrently (root)
cd be && npm install
cd ../fe && npm install

# terminale unico (API :3001 + Angular :4200)
npm run dev
```

Oppure due terminali: `npm run dev:api` e `npm run dev:fe`.

- UI: http://localhost:4200  
- Health: http://localhost:3001/api/health  

### Stack

| Parte | Tecnologie |
|-------|------------|
| Frontend | Angular 21, Tailwind CSS 4, UI stile Spartan/shadcn (Tailwind) |
| Backend | Fastify, Vercel AI SDK, `@ai-sdk/anthropic` |
| DB | Postgres skill CLI (`query run`, `schema inspect`, `query find`) |

Per aggiungere componenti [Spartan-ng](https://www.spartan.ng) in seguito: `cd fe && npx @spartan-ng/cli init` (richiede rete/registry).

### Sicurezza

La chat non può eseguire `INSERT`, `UPDATE`, `DELETE`, DDL o migration: solo `SELECT` / `WITH` / `EXPLAIN`.
