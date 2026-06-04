---
name: Docker deploy Dimmelo
overview: "VPS pronto (Docker, Portainer, Caddy, Postgres container con DB palio ripristinato). Dominio app: dimmelo.marcomeini.it. Resta da implementare nel repo: immagini FE/BE, compose, chat via pg senza skill CLI, deploy dietro Caddy."
todos:
  - id: vps-infra
    content: "VPS: m.meini, Docker, Portainer, Caddy portainer.marcomeini.it, Postgres container + restore palio"
    status: completed
  - id: pg-driver-chat
    content: "postgres-cli: ramo pg via DATABASE_URL + pool condiviso; health SELECT 1"
    status: completed
  - id: config-env-docker
    content: Config produzione da env; OAuth/google via env o volume; DATABASE_URL verso container postgres
    status: completed
  - id: dockerfiles
    content: be/Dockerfile, fe/Dockerfile + fe/nginx.conf (proxy /api, SSE)
    status: completed
  - id: docker-network
    content: Rete bridge postgres (172.18.0.0/16); container postgres @ 172.18.0.2
    status: completed
  - id: compose-env
    content: docker-compose.yml (be+fe), networks.external postgres, .env.production.example
    status: completed
  - id: caddy-dimmelo
    content: "Caddyfile: blocco dimmelo.marcomeini.it → 127.0.0.1:8080; OAuth redirect su stesso dominio"
    status: completed
  - id: docs-deploy
    content: "README: deploy VPS, restore script, Caddy, compose, OAuth Google"
    status: completed
isProject: false
---

# Deploy Docker Dimmelo

## Domini

| Host | Uso |
|------|-----|
| **`dimmelo.marcomeini.it`** | App Dimmelo (Angular + API via proxy) |
| **`portainer.marcomeini.it`** | Portainer |

Tutti gli URL di produzione (`CORS`, OAuth `publicAppUrl` / `publicApiUrl`, redirect Google) usano **`https://dimmelo.marcomeini.it`**.

## Stato attuale (già fatto sul VPS)

| Step | Stato | Note |
|------|--------|------|
| VPS Debian, utente `m.meini` + sudo | Fatto | SSH root disabilitato |
| Docker Engine + Compose plugin | Fatto | |
| Portainer CE | Fatto | Preferire binding `127.0.0.1:9443` |
| Caddy + `portainer.marcomeini.it` | Da confermare | Scelta Caddy confermata; verificare HTTPS funzionante |
| Container Postgres (`postgres`) | Fatto | Non installato Postgres sul host |
| Restore DB `palio` | Fatto | [`restore-palio.sh`](docker/restore-palio-local.sh) — **252** righe in `palii`, 11 tabelle |
| `dimmelo_users` | Fatto | Presente nel DB dopo restore/migration |
| Rete Docker **`postgres`** | Fatto | Bridge `172.18.0.0/16`, container DB `172.18.0.2` |
| Repo / immagini Dimmelo | **Da fare** | Nessun `Dockerfile` / `docker-compose.yml` in repo ancora |
| Dominio app **`dimmelo.marcomeini.it`** | **Da fare** | DNS A → VPS; blocco Caddy + OAuth Google |

Verifica post-restore (già OK sul server):

```bash
docker exec postgres psql -U postgres -d palio -c 'SELECT count(*) FROM palii;'
```

Connessione dal **host** VPS: `postgresql://postgres:<POSTGRES_PASSWORD>@127.0.0.1:5432/palio`

## Architettura target

```mermaid
flowchart LR
  user[Browser]
  caddy[Caddy_host_443]
  fe[container_fe_nginx]
  be[container_be_node]
  db[(container_postgres)]

  user -->|HTTPS| caddy
  caddy -->|portainer.marcomeini.it| portainer[Portainer_9443]
  caddy -->|dimmelo.marcomeini.it| fe
  fe -->|static| user
  fe -->|proxy_/api| be
  be -->|DATABASE_URL| db
```

- **Caddy** sul host occupa **80/443** (Let’s Encrypt).
- **Portainer** e **Postgres** solo su `127.0.0.1` (o rete Docker interna).
- **Dimmelo FE** in ascolto su `127.0.0.1:8080` → Caddy `reverse_proxy 127.0.0.1:8080`.
- **Dimmelo BE** non esposto pubblicamente; raggiungibile dal FE come `http://be:3001` nella rete compose.
- **OAuth:** `AUTH_PUBLIC_APP_URL` e `AUTH_PUBLIC_API_URL` = `https://dimmelo.marcomeini.it` (stesso host; `/api` proxato dal FE nginx al BE).

## Rete Docker `postgres` (Portainer)

Rete **bridge** dedicata (nome suggerito: **`postgres`**, come in Portainer) per far risolvere il hostname `postgres` tra container.

### Creazione

**Portainer UI** (Networks → Add network): Name `postgres`, Driver `bridge`, subnet vuoti, **Isolated** OFF, **manual attachment** ON.

Se compare **Forbidden - origin invalid** (Portainer dietro Caddy): è CSRF/origine — vedi sotto *Portainer + Caddy*.

**Workaround immediato (SSH sul VPS):**

```bash
docker network create postgres
docker network connect postgres postgres   # rete → container DB
docker network inspect postgres
```

### Portainer + Caddy (errore origin invalid)

Ricreare/avviare Portainer con origini attendibili, es.:

```bash
-e TRUSTED_ORIGINS=portainer.marcomeini.it
# oppure URL completo, secondo versione Portainer CE
```

Nel Caddyfile, proxy con header inoltrati:

```
portainer.marcomeini.it {
    reverse_proxy https://127.0.0.1:9443 {
        header_up Host {host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-For {remote_host}
        transport http {
            tls_insecure_skip_verify
        }
    }
}
```

Accedere sempre con **https://portainer.marcomeini.it** (non IP:9443 misto col dominio).

### Collegare il container DB (obbligatorio)

Creare la rete **non** sposta automaticamente il container esistente.

1. **Containers** → container **`postgres`** (nome del container Postgres)
2. **Join network** / **Networking** → aggiungi rete **`postgres`**
3. In alternativa da CLI sul VPS:  
   `docker network connect postgres postgres`  
   (primo `postgres` = rete, secondo = nome container)

Verifica:

```bash
docker network inspect postgres
# deve comparire il container postgres nella sezione Containers
```

### Dimmelo (dopo il compose)

`docker-compose.yml` userà rete esterna:

```yaml
networks:
  postgres:
    external: true
```

Servizi `be` (e opzionalmente `fe` se non serve al DB) su `networks: [postgres]`.

`DATABASE_URL=postgresql://postgres:<POSTGRES_PASSWORD>@postgres:5432/palio`  
(host **`postgres`** = nome del **container**, risolto sulla rete omonima)

Non esporre `5432` su `0.0.0.0` verso Internet; dal host VPS resta `127.0.0.1:5432` se mappato.

## Vincolo tecnico nel codice (ancora da implementare)

Oggi la chat e `/api/health` usano [`be/lib/postgres-cli.mjs`](be/lib/postgres-cli.mjs) → binario skill Postgres **assente nel container BE**.

L’auth usa già [`PgClientManager`](be/lib/pg-client-manager.mjs) + [`loadPgConfig`](be/lib/db-config.js) (`DATABASE_URL` supportato).

**Da fare:** ramo driver `pg` in `postgres-cli` quando `DATABASE_URL` è impostato; `profileTest()` → `SELECT 1`; pool condiviso da [`be/server/index.mjs`](be/server/index.mjs).

## File da aggiungere nel repo

| File | Ruolo |
|------|--------|
| [`docker-compose.yml`](docker-compose.yml) | Servizi `be` + `fe`; rete verso postgres esistente; `env_file: .env.production` |
| [`be/Dockerfile`](be/Dockerfile) | Node 20 Alpine, `npm ci --omit=dev` |
| [`fe/Dockerfile`](fe/Dockerfile) | Multi-stage `ng build` → nginx |
| [`fe/nginx.conf`](fe/nginx.conf) | Static + `location /api/` → `http://be:3001` (SSE: `proxy_buffering off`) |
| [`.env.production.example`](.env.production.example) | Template (gitignore `.env.production`) |
| [`docker/restore-palio-local.sh`](docker/restore-palio-local.sh) | Già presente — documentare in README |

Niente `config.mjs` locale nell’immagine; config da variabili d’ambiente.

## `.env.production` (esempio)

```bash
DATABASE_URL=postgresql://postgres:PASSWORD@postgres:5432/palio
NODE_ENV=production
ANTHROPIC_API_KEY=sk-ant-...
AUTH_ENABLED=true
AUTH_SESSION_SECRET=...
AUTH_PUBLIC_APP_URL=https://dimmelo.marcomeini.it
AUTH_PUBLIC_API_URL=https://dimmelo.marcomeini.it
CORS_ORIGIN=https://dimmelo.marcomeini.it
# GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET oppure volume google-oauth.json
```

Google Cloud: redirect URI `https://dimmelo.marcomeini.it/api/auth/google/callback`

## Caddy sul VPS (da completare per Dimmelo)

In `/etc/caddy/Caddyfile`, oltre a Portainer:

```
dimmelo.marcomeini.it {
    reverse_proxy 127.0.0.1:8080
}
```

DNS: record A `dimmelo.marcomeini.it` → `54.37.156.45`. Poi `sudo systemctl reload caddy`.

## Deploy sul VPS (dopo implementazione repo)

1. `git clone` / `rsync` progetto su VPS (es. `~/palio`)
2. `cp .env.production.example .env.production` e compila segreti
3. Montare `google-oauth.json` o variabili Google
4. `docker compose up -d --build` dalla root
5. Verifica: `curl -s https://dimmelo.marcomeini.it/api/health`

## Ordine implementazione (codice)

1. `postgres-cli` + health con `DATABASE_URL` / pool
2. Loader config da env
3. Dockerfile BE + FE + `nginx.conf`
4. `docker-compose.yml` + rete postgres + `.env.production.example`
5. README (restore, Caddy, compose, OAuth)
6. Test build locale; smoke su VPS

## Fuori scope (fase 1)

- CI/CD e registry
- Scraper `palio.org` / skill Postgres nel container (operator da Mac)
- Nuovo dump/backup automatico (opzionale script cron sul VPS)
