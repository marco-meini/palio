## WIP

### regolamento_chunks.sql
- `regolamento_chunks` — chunk testo regolamento + embedding `vector(384)` (modello e5-small)
- Richiede estensione `vector` ([`db/bootstrap/03_pgvector.sql`](../bootstrap/03_pgvector.sql) come superuser)
- Popolamento: `cd server && npm run index-regolamento`

### dimmelo_users.sql
- `dimmelo_users` — email (unique, lowercase), `display_name`, `created_at`; seed Marco

### palio_chat_ro.sql
- Ruolo `palio_chat_ro` (LOGIN) con `SELECT` sulle tabelle Palio per chat e MCP sidecar
- Configurare `CHAT_DATABASE_URL` o profile `chat_ro` in `.skills/postgres/config.toml` (password via `CHAT_DB_PASSWORD` / `POSTGRES_PASSWORD`)

### prerelease.sql
- `palii`, anagrafiche, `palio_partecipazioni` con colonna **`canape`** (1–9 posto canape, **10** = rincorsa `R`)
- `palio_partecipazioni.non_partecipa` — contrada estratta ma non corre (`N.P.` sul sito): `canape`, `cavallo_id`, `fantino_id` NULL
- `palio_partecipazione_mangini` (ordine = ordine lista mangini, non canape)
- Scraper: sommario + `/ingresso-canape` per cavallo/fantino di tutte le contrade; righe `N.P.` importate con flag
- `palio_partecipazioni.ordine` — posizione nell’estrazione (1–10, da `/ordine-estrazione`; distinto da `canape`)
- `palio_partecipazioni.estratta` — contrada tra le dieci estratte (`true` se presente nel blocco «Estrazione di …»)
- `palio_partecipazioni.estratta_da_id` — FK su `contrade` quando il sito indica «estratta da [contrada]»; NULL per Sindaco o assenza riga
- Scraper: terza fetch `/ordine-estrazione`; merge su righe canape esistenti (non importa «Le altre sette»)
- `palio_partecipazioni.ordine`, `estratta`, `estratta_da_id` — da `/ordine-estrazione`: `ordine` per le 10 al canape; `estratta` solo con riga «estratta da …»; `estratta_da_id` NULL per Sindaco o assente
- Scraper: terza richiesta `/ordine-estrazione` (merge sulle righe canape)
- `palio_partecipazioni.ordine_assegnazione`, `orecchio`, `coscia`, `proprietario_cavallo`, `cavallo_preso_da` — da `/assegnazione-cavalli` (tabella `.RigaTabCavalli`)
- Scraper: quarta fetch `/assegnazione-cavalli`; merge su righe canape esistenti (come ordine-estrazione)
- `palio_partecipazioni.ordine_arrivo` — posizione in arrivo (1, 2, 3…; da `/ordine-arrivo`; NULL se non elencata)
- Scraper: quinta fetch `/ordine-arrivo`; merge su righe canape esistenti (come ordine-estrazione)

## RELEASED
