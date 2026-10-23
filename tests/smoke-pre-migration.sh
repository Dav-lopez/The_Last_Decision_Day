#!/usr/bin/env bash
# Day 1 smoke test: schema is deliberately NOT initialized yet.
set -euo pipefail
BASE="${1:-http://localhost:8080}"
fail=0
check() {
  local name="$1" expected="$2" url="$3" method="${4:-GET}" actual
  # Compose can report containers started before nginx/web/API are ready.
  # Retry the expected HTTP status (including the intentional 503) instead of
  # relying on curl's transport-only retry rules.
  actual="000"
  for attempt in {1..30}; do
    actual="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 -X "$method" "$url")" || actual="000"
    [[ "$actual" == "$expected" ]] && break
    sleep 2
  done
  if [[ "$actual" == "$expected" ]]; then
    printf 'PASS %s (%s)\n' "$name" "$actual"
  else
    printf 'FAIL %s (expected %s, got %s)\n' "$name" "$expected" "$actual" >&2
    fail=1
  fi
}
check 'web index' 200 "$BASE/"
check 'web SPA fallback' 200 "$BASE/game/unknown-route"
check 'API liveness' 200 "$BASE/api/v1/health/live"
check 'API readiness without migration' 503 "$BASE/api/v1/health/ready"
check 'SignalR negotiate' 200 "$BASE/hubs/world/negotiate?negotiateVersion=1" POST
exit "$fail"
