#!/usr/bin/env bash
# Wrapper for full ilpalio scraping. Run from repo root or server/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
SERVER="$ROOT/server"
DELAY_MS=800
MAX_RANGE=100

usage() {
  cat <<'EOF'
Usage: scrape.sh --palio CODE
       scrape.sh --from YYYY-MM-DD --to YYYY-MM-DD --end-code CODE

  --palio CODE           Single Palio (all 6 pages), via --source-code
  --from / --to DATE     Date range (inclusive lower bound via --until-date on --from)
  --end-code CODE        Newest Palio source code in range (required with --from/--to)
  --max N                Override max Palii for range mode (default 100)
  --delay-ms MS          Pause between requests (default 800)
  --fail-fast            Stop on first error

Examples:
  ./.cursor/skills/scrape-ilpalio/scripts/scrape.sh --palio 202507020
  ./.cursor/skills/scrape-ilpalio/scripts/scrape.sh \
    --from 2025-07-01 --to 2025-08-16 --end-code 202508160
EOF
}

PALIO=
FROM=
TO=
END_CODE=
MAX=
FAIL_FAST=

while [[ $# -gt 0 ]]; do
  case "$1" in
    --palio) PALIO="${2:?}"; shift 2 ;;
    --from) FROM="${2:?}"; shift 2 ;;
    --to) TO="${2:?}"; shift 2 ;;
    --end-code) END_CODE="${2:?}"; shift 2 ;;
    --max) MAX="${2:?}"; shift 2 ;;
    --delay-ms) DELAY_MS="${2:?}"; shift 2 ;;
    --fail-fast) FAIL_FAST=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

ARGS=(--delay-ms "$DELAY_MS")
[[ -n "${FAIL_FAST:-}" ]] && ARGS+=(--fail-fast)

if [[ -n "$PALIO" ]]; then
  if [[ -n "$FROM" || -n "$TO" || -n "$END_CODE" ]]; then
    echo "Use either --palio or --from/--to/--end-code, not both." >&2
    exit 1
  fi
  exec npm exec --prefix "$SERVER" tsx src/tasks/scrape-ilpalio.ts --source-code "$PALIO" "${ARGS[@]}"
fi

if [[ -n "$FROM" || -n "$TO" || -n "$END_CODE" ]]; then
  if [[ -z "$FROM" || -z "$END_CODE" ]]; then
    echo "--from and --end-code are required for date range mode (--to is documentation only)." >&2
    usage >&2
    exit 1
  fi
  ARGS+=(--source-code "$END_CODE" --until-date "$FROM" --max "${MAX:-$MAX_RANGE}")
  exec npm exec --prefix "$SERVER" tsx src/tasks/scrape-ilpalio.ts "${ARGS[@]}"
fi

usage >&2
exit 1
