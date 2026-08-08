# Hardening Postgres (VPS)

Postgres non deve essere raggiungibile da Internet. Sul VPS il container espone la porta host **solo su loopback**.

## Binding corretto

```text
127.0.0.1:9634 → container:5432
```

- App Dimmelo (`palio-be`) usa l’host Docker `postgres:5432` sulla rete `postgres` (nessuna porta pubblica).
- Accesso admin/dev dal Mac: tunnel SSH (vedi sotto), poi `127.0.0.1:9634`.

## Ricreare il container (se ancora su 0.0.0.0)

Con accesso Docker sul VPS (es. `debian` + `sudo -n docker`):

```bash
PASS="$(sudo docker inspect postgres --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^POSTGRES_PASSWORD=//p')"
VOL="$(sudo docker inspect postgres --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql"}}{{.Name}}{{end}}{{end}}')"
IMG="$(sudo docker inspect postgres --format '{{.Config.Image}}')"

sudo docker stop postgres
sudo docker rename postgres postgres-old-public-bind

sudo docker run -d \
  --name postgres \
  --restart unless-stopped \
  --network postgres \
  -e POSTGRES_PASSWORD="$PASS" \
  -v "${VOL}:/var/lib/postgresql" \
  -p 127.0.0.1:9634:5432 \
  "$IMG"

sudo docker rm postgres-old-public-bind
sudo docker exec postgres pg_isready -U postgres
sudo docker port postgres   # deve mostrare 127.0.0.1:9634
```

Verifica da fuori: `nc -z HOST 9634` deve fallire. Da VPS: `ss -tln | grep 9634` → solo `127.0.0.1:9634`.

## Tunnel SSH (dev locale)

Dal Mac:

```bash
./docker/ssh-tunnel-db.sh
# oppure:
ssh -N -L 9634:127.0.0.1:9634 m.meini@54.37.156.45
```

Poi in `.env` / `.skills/postgres/config.toml` usa `host=127.0.0.1` e `port=9634`.
