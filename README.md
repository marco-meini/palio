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
# Modifica .env: DATABASE_URL, ANTHROPIC_API_KEY, COOKIE_SECRET, ZITADEL_* (vedi Autenticazione)
```

Variabili principali (elenco completo in [`.env.example`](.env.example)):

| Variabile | Dev tipico | Descrizione |
|-----------|------------|-------------|
| `DATABASE_URL` | `postgresql://...@127.0.0.1:5432/palio` | Pool API / scraper / auth |
| `CHAT_DATABASE_URL` | (opzionale) | Pool read-only chat (`palio_chat_ro`) |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Obbligatoria per la chat |
| `APP_URL` | `http://localhost:4200` | URL pubblico del frontend (origin ammesso, redirect OIDC) |
| `COOKIE_SECRET` | `openssl rand -base64 48` | Firma dello stato del login e cifratura dei refresh token (≥ 32 caratteri) |
| `ZITADEL_URL` / `ZITADEL_PROJECT_ID` | `https://id.marcomeini.it` / id | Issuer OIDC e progetto Dimmelo (i suoi ruoli sono i permessi) |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | dall'app `dimmelo-web` | Client OIDC (solo backend) |
| `ZITADEL_TOKEN` | PAT | Service account per la pagina Utenti (inviti e ruoli) |
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

Dalla root (dopo `npm ci`, `npm ci --prefix server`, `npm ci --prefix client`):

```bash
npm run typecheck   # tsc di server e client
npm test            # server: parser + guardrail SQL read-only + auth; client: vitest
npm run build       # tsc del server + build Angular
```

Sono gli stessi controlli della CI (vedi [CI e rilascio in produzione](#ci-e-rilascio-in-produzione)).

### Autenticazione (OIDC con ZITADEL)

Il login è **OIDC** (authorization code + PKCE, client confidenziale) verso **ZITADEL**
(`https://id.marcomeini.it`, lo stesso di dimora). «Accedi» porta alla pagina di login di
ZITADEL, dove si entra con una **passkey** (registrata su `id.marcomeini.it`, quindi valida per
tutte le app) o con **Google**. Al ritorno (`/api/auth/callback`) il backend verifica i token,
apre la propria sessione server-side e il browser riceve solo un cookie httpOnly (`palio_sid`):
i token restano sul server (refresh token cifrato in DB). «Esci» chiude la sessione di palio e
quella di ZITADEL.

**Permessi = ruoli del progetto Dimmelo su ZITADEL** (stesse chiavi):

- `chat.use` — usare la chat Dimmelo;
- `users.view` — vedere gli utenti; `users.manage` — gestirli (comprende vedere).

Il progetto ha *Only authorized users can authenticate*: entra solo chi ha almeno un ruolo. I
ruoli arrivano nell'ID token; ogni 5 minuti il backend li rilegge con il refresh token, così un
ruolo tolto o un accesso disattivato valgono anche per le sessioni già aperte (se ZITADEL rifiuta
il refresh, la sessione si chiude). Ogni endpoint dichiara cosa serve (`guard.public()`,
`guard.anyUser()`, `guard.require(...)`); le richieste non-GET devono avere `Origin` uguale ad
`APP_URL` (protezione CSRF).

**Gli utenti si gestiscono da Dimmelo**, pagina *Utenti* (oppure dalla console di ZITADEL,
*Role Assignments* del progetto): la pagina lavora sugli accessi al progetto (*user grant*) con
il service account di palio.

- **Nuovo utente.** Collega l'account ZITADEL con la stessa email (es. già usato per dimora) o
  lo crea con email verificata, assegna i ruoli e genera un **link per creare la passkey** sulla
  pagina di ZITADEL, da mandare all'utente (monouso, scade presto: se serve se ne genera un altro
  con *Invito*). Se l'utente usa Google con la stessa email può entrare direttamente con Google
  (collegamento automatico per email).
- **Modifica.** Nome ed email cambiano sull'account ZITADEL, quindi anche nelle altre app; i
  permessi sul ruolo del progetto.
- **Disattivazione.** Sospende l'accesso a Dimmelo (i ruoli restano) e chiude le sessioni.
- **Eliminazione.** Toglie l'accesso a Dimmelo; l'account ZITADEL e le passkey restano.

Si gestiscono solo utenti con permessi che si hanno anche e si assegnano solo i propri; nessuno
cambia i propri permessi né disattiva o elimina sé stesso, e resta sempre almeno un utente
attivo con `users.manage`.

**Utenti di partenza.** Quelli della vecchia allowlist `dimmelo_users` si portano su ZITADEL
(account collegato o creato, ruolo `chat.use`) con:

```bash
cd server && npm run import:dimmelo-users -- --dry-run   # cosa farebbe
cd server && npm run import:dimmelo-users                # lo fa (scrive su ZITADEL)
```

#### Configurazione su ZITADEL (una volta)

1. **Progetto `Dimmelo`** con i ruoli `chat.use`, `users.view`, `users.manage` e le opzioni
   *Return user roles during authentication* e *Only authorized users can authenticate*. Il suo
   id va in `ZITADEL_PROJECT_ID`.
2. **Applicazione `dimmelo-web`** nel progetto: tipo *Web*, autenticazione *Basic*, grant
   *Authorization Code* e *Refresh Token*; redirect `https://dimmelo.marcomeini.it/api/auth/callback`
   e `http://localhost:4200/api/auth/callback` (con *Development Mode* per `http`), post logout
   `…/uscito`; nei token *User roles inside ID Token* e *User Info inside ID Token*. Client id e
   secret in `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`.
3. **Service account** per la pagina Utenti (`palio`, e in locale `palio-dev`): tra i *Managers*
   dell'istanza con ruolo `IAM_OWNER`, come `dimora`; un *Personal Access Token* nella sua
   scheda va in `ZITADEL_TOKEN` (solo backend). Senza token il login funziona, la pagina Utenti no.
4. **Ruoli** agli utenti: dalla pagina Utenti o da *Role Assignments* del progetto.

In sviluppo si usa lo stesso ZITADEL di produzione: `APP_URL=http://localhost:4200` (redirect
già registrato nell'applicazione).

#### Deploy produzione (Docker + Caddy)

Produzione prevista su **`https://dimmelo.marcomeini.it`** (Caddy sul VPS, container FE/BE, Postgres in container Docker sulla rete `postgres`).

**Prerequisiti VPS:** Docker (utente nel gruppo `docker`), rete `postgres` con container DB collegato, DB `palio` ripristinato ([`docker/restore-palio-local.sh`](docker/restore-palio-local.sh)).

1. Clona il repo sul server (`~/palio`) e configura l'ambiente:
   ```bash
   cp .env.production.example .env.production
   # DATABASE_URL=postgresql://postgres:PASSWORD@postgres:5432/palio
   # ANTHROPIC_API_KEY, APP_URL, COOKIE_SECRET, ZITADEL_*, OIDC_CLIENT_* (vedi Autenticazione)
   ```
2. Abilita pgvector e crea la tabella regolamento (una tantum), poi indicizza il PDF:
   ```bash
   psql "$DATABASE_URL" -f db/bootstrap/03_pgvector.sql
   psql "$DATABASE_URL" -f db/migrations/released/regolamento_chunks.sql
   cd server && npm run index-regolamento
   ```
   Una tantum, prima del primo rilascio: passa ad `app_palio` la proprietà delle tabelle (le migrazioni di `scripts/release.sh` girano con quel ruolo e possono modificare solo oggetti suoi). Idempotente:
   ```bash
   docker exec -i postgres psql -U postgres -d palio -v ON_ERROR_STOP=1 < db/bootstrap/04_owner_app_palio.sql
   ```
3. Caddy — al primo rilascio aggiungi il blocco in [`docker/caddy-dimmelo.snippet`](docker/caddy-dimmelo.snippet) a `/etc/caddy/Caddyfile` e ricarica Caddy (`sudo systemctl reload caddy`).
4. Rilascio con `scripts/release.sh`: vedi [CI e rilascio in produzione](#ci-e-rilascio-in-produzione).
5. Verifica: `curl -s https://dimmelo.marcomeini.it/api/health`

In Docker il backend usa **`DATABASE_URL`** da `.env.production`. In dev: `.env` nella root del repo.

**Portainer dietro Caddy:** se compare `Forbidden - origin invalid`, imposta `TRUSTED_ORIGINS=portainer.marcomeini.it` sul container Portainer e inoltra `Host` / `X-Forwarded-Proto` nel proxy Caddy.

#### Deploy pubblico (HTTPS) — note

- `APP_URL` = `https://dimmelo.marcomeini.it` (stesso host per frontend e API: nginx inoltra `/api` al BE, niente CORS). Con `https` i cookie sono `Secure`.
- Non esporre Postgres su Internet. Binding host: **`127.0.0.1:9634→5432`** (rete Docker `postgres` per l’app). Dettagli e runbook: [`docker/harden-postgres.md`](docker/harden-postgres.md).
- Dev locale verso il DB sul VPS: tunnel SSH [`docker/ssh-tunnel-db.sh`](docker/ssh-tunnel-db.sh), poi `DATABASE_URL` / skill profile su `127.0.0.1:9634`.

Route di autenticazione e utenti:

| Metodo | Path | Accesso | Descrizione |
|--------|------|---------|-------------|
| GET | `/api/auth/login?returnTo=` | pubblico | Redirect alla pagina di login di ZITADEL |
| GET | `/api/auth/callback` | pubblico (state firmato) | Ritorno da ZITADEL: apre la sessione |
| POST | `/api/auth/logout` | pubblico | Chiude la sessione; risponde con l'URL di uscita da ZITADEL |
| GET | `/api/auth/me` | utente | Utente corrente e permessi effettivi |
| GET | `/api/users`, `/api/users/:id`, `/api/permissions` | `users.view` | Elenco, scheda, catalogo permessi |
| POST/PUT/DELETE | `/api/users[/:id[/invite\|disable\|enable]]` | `users.manage` | Gestione utenti |
| POST | `/api/chat` | `chat.use` | Chat |

`GET /api/health` resta pubblico (monitoring).

## Database

- Bootstrap istanza: [`db/bootstrap/`](db/bootstrap/)
- Schema iniziale contrade: [`db/dumps/initial_palio_schema.sql`](db/dumps/initial_palio_schema.sql)
- Script di schema: [`db/migrations/`](db/migrations/) (`NNNN_*.sql` in sospeso, già rilasciati in [`released/`](db/migrations/released/)); note in [`CHANGELOG.md`](db/migrations/CHANGELOG.md)

Config Postgres locale (non versionata): `.skills/postgres/config.toml`

### Script di schema

Lo schema si gestisce con script SQL in `db/migrations/NNNN_descrizione.sql`, **eseguiti sempre a mano** in ordine (nessun automatismo: né l'app né i container li lanciano). In locale:

```bash
export DB_PROJECT_ROOT="$PWD"
export POSTGRES_CLI="$HOME/.agents/skills/postgres/scripts/postgres"
export DB_PROFILE=local

"$POSTGRES_CLI" profile test
"$POSTGRES_CLI" query run -f db/migrations/NNNN_descrizione.sql
```

Uno script già eseguito non va modificato: per cambiare lo schema se ne aggiunge uno nuovo.

In produzione gli script li esegue `scripts/release.sh`, lanciato a mano: quelli già rilasciati stanno in `db/migrations/released/`.

## CI e rilascio in produzione

**Versione.** Si rilascia una versione, cioè un tag `vX.Y.Z` uguale alla `version` del `package.json` di root. In locale, su `main` pulito:

```bash
npm version patch          # oppure minor / major: aggiorna package.json, fa commit e tag
git push --follow-tags     # invia commit e tag
```

**CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml), GitHub Actions). Parte solo al push di un tag `vX.Y.Z`, non a ogni push. Esegue typecheck, test e build (Node da [`.nvmrc`](.nvmrc), come le immagini Docker); se passano, pubblica su GitHub Container Registry le immagini con la versione nel tag:

- `ghcr.io/marco-meini/palio-server:X.Y.Z`
- `ghcr.io/marco-meini/palio-client:X.Y.Z`

Se il tag non corrisponde a `package.json`, la CI fallisce. La CI non accede al server né al database: il rilascio resta manuale.

**Rilascio.**

Produzione: Dimmelo su `https://dimmelo.marcomeini.it`, dietro Caddy sul server ([`docker/caddy-dimmelo.snippet`](docker/caddy-dimmelo.snippet)), con Postgres nel container `postgres` (rete Docker `postgres`).

Sul server c'è una copia del repo (`git clone`), con il `.env.production` nella root. Sul server non c'è nessuna chiave per GitHub: ci si entra con l'inoltro dell'ssh-agent (`ssh -A`, o `ForwardAgent yes` solo per quell'host in `~/.ssh/config`), così `git pull` e `git push` usano la chiave locale finché la sessione è aperta. Il rilascio si lancia lì, a mano:

```bash
ssh -A <utente>@<server>
cd ~/palio
cp scripts/release.conf.example scripts/release.conf   # una volta: Postgres, immagini, health check
scripts/release.sh --dry-run                           # mostra cosa farebbe
scripts/release.sh                                     # rilascia
```

Lo script:

1. aggiorna il codice (`git pull --rebase`); la copia sul server non deve avere modifiche locali.
   Rilascia la versione di `package.json`, che deve avere il suo tag `vX.Y.Z`.
   Dopo il tag non ci devono essere modifiche al codice né migrazioni nuove: sono ammessi solo
   i commit di rilascio dello script. Poi controlla che su GHCR ci siano le immagini `:X.Y.Z`,
   che ci sono solo se la CI è passata. Se qualcosa non torna si ferma prima di toccare il
   database;
2. esegue, in ordine di nome, le migrazioni di `db/migrations/` non ancora in `released/`, come
   superuser ma con il ruolo applicativo (`PG_APP_ROLE`), così gli oggetti sono suoi; ognuna,
   se va a buon fine, viene spostata in `released/`. Gli spostamenti finiscono in un commit che
   lo script invia al repository (`git push`): in locale arrivano col prossimo `git pull`.
   Al primo errore si ferma e non aggiorna i container;
3. scarica le immagini della CI, riavvia i container (`docker compose up -d --wait`) e
   controlla `HEALTH_URL`.

Opzioni: `--dry-run`, `--yes` (senza conferma), `--skip-migrations`, `--skip-deploy`, `--build`.
Con `--build`, o con `IMAGE_PREFIX` vuoto in `release.conf`, le immagini si costruiscono sul
server. Serve, per esempio, se GHCR non risponde.

**Accesso del server alle immagini** (una volta, se le immagini su GHCR sono private).
1. Su GitHub crea un token *classic* con il solo permesso `read:packages`
   (*Settings → Developer settings → Personal access tokens → Tokens (classic)*).
2. Sul server lancia `docker login ghcr.io -u marco-meini` e incolla il token come password.
   Docker lo salva in `~/.docker/config.json`.

Il token permette solo di scaricare i pacchetti: non dà accesso al codice né al repo.

## Import da ilpalio.siena.it

Workflow completo (singolo Palio, intervallo date, validazione): skill agent
[`.claude/skills/scrape-ilpalio/`](.claude/skills/scrape-ilpalio/).

Per ogni Palio lo scraper effettua **otto richieste**:

1. **Sommario** (`/5/Palio/{codice}`) — data, straordinario, vincitrice (contrada vincente e fantino con nome completo)
2. **Ingresso al canape** (`/5/Palio/{codice}/ingresso-canape`) — tutte le contrade con **cavallo**, **fantino** e posto al canape
3. **Dirigenze** (`/5/Palio/{codice}/dirigenze`) — per ogni contrada al canape: capitano, priore (o governatore/rettore), mangini, barbaresco (tutte le partecipazioni, non solo la vincitrice)
4. **Ordine di estrazione** (`/5/Palio/{codice}/ordine-estrazione`) — ordine di estrazione (1–10), flag `estratta` e eventuale «estratta da [contrada]» (solo sulle righe già importate dal canape; la sezione «Le altre sette» non crea righe)
5. **Assegnazione cavalli** (`/5/Palio/{codice}/assegnazione-cavalli`) — ordine in tratta, numeri orecchio/coscia, proprietario e «preso da» (merge sulle righe canape, come ordine-estrazione)
6. **Ordine di arrivo** (`/5/Palio/{codice}/ordine-arrivo`) — posizione in arrivo (1°, 2°, …; merge sulle righe canape; solo i piazzati elencati sul sito)
7. **Cadute** (`/5/Palio/{codice}/cadute`) — giro di caduta 1–3 (`giro_caduta`; `NULL` se non caduta; merge sulle righe canape)
8. **Prove** (`/5/Palio/{codice}/prove`) — sei prove (canape + fantino per contrada in `palio_prove`; niente cavallo)

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

### Prove (`palio_prove`)

Da `/prove` (solo `div[data-icprova]` = ingresso al canape; non arrivo/cadute delle prove). Una riga per (palio, numero prova, contrada):

| Colonna | Significato |
|---------|-------------|
| `numero` | 1–4 Prima…Quarta, 5 Prova Generale, 6 Provaccia |
| `canape` | Posto in prova (1–9; 10 = R); NULL se N.P. |
| `fantino_id` | Fantino in prova (può cambiare); NULL se N.P. |
| `non_partecipa` | Es. Provaccia annullata |

Il cavallo non è duplicato: resta in `palio_partecipazioni` per l’edizione.

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

Test parser: `cd server && npm test` (fixture `test/fixtures/ordine-arrivo-202507020.html`, `test/fixtures/cadute-202607020.html`, `test/fixtures/prove-202607020.html`, `test/fixtures/dirigenze-202507020.html`).

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
| Backend | Express 5, Vercel AI SDK, `@ai-sdk/anthropic` |
| DB | Postgres skill CLI (`query run`, `schema inspect`, `query find`) |
| Regolamento | Embedding locali (`@xenova/transformers`), pgvector su Postgres, OCR (`tesseract.js` + `pdftoppm`) |

Per aggiungere componenti [Spartan-ng](https://www.spartan.ng) in seguito: `cd client && npx @spartan-ng/cli init` (richiede rete/registry).

### Sicurezza

La chat non può eseguire `INSERT`, `UPDATE`, `DELETE`, DDL o migration: solo `SELECT` / `WITH` / `EXPLAIN`.

Solo gli utenti con il ruolo `chat.use` sul progetto Dimmelo di ZITADEL possono usare la chat (login OIDC, sessione server-side in cookie httpOnly; nessun token nel browser). Le tabelle di autenticazione non sono leggibili dal ruolo della chat (`palio_chat_ro`). In produzione usa sempre HTTPS.
