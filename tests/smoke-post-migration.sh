#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-http://localhost:8080}"
for attempt in {1..20}; do
  live="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/api/v1/health/live" || true)"
  ready="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/api/v1/health/ready" || true)"
  if [[ "$live" == "200" && "$ready" == "200" ]]; then
    echo "PASS: live and ready endpoints returned HTTP 200 after migration"
    exit 0
  fi
  sleep 2
done
echo "FAIL: API did not become ready after applying migration (live=$live, ready=$ready)" >&2
exit 1
