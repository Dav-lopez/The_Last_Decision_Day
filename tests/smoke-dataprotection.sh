#!/usr/bin/env bash
# Verify the configured Data Protection volume is writable by the API process
# and survives an API container restart. This does not exercise an HTTPS login.
set -euo pipefail

BASE="${1:-http://localhost:8080}"

# Local Docker serves HTTP. The secure __Host- antiforgery cookie deliberately
# rejects HTTP requests, so do not call /auth/csrf to initialize a key here.
configured="$(docker compose exec -T api printenv DataProtection__KeysDirectory | tr -d '\r')"
if [[ "$configured" != "/app/keys" ]]; then
  echo "FAIL: Data Protection key directory is not /app/keys" >&2
  exit 1
fi

probe=".smoke-dataprotection-$$"
cleanup() {
  docker compose exec -T api sh -c "rm -f /app/keys/$probe" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Writing as the unprivileged runtime user tests volume ownership as well.
before="$(docker compose exec -T api sh -c "umask 077; printf 'key-volume-persistence-test\\n' > /app/keys/$probe; sha256sum /app/keys/$probe" | tr -d '\r')"
if [[ -z "$before" ]]; then
  echo "FAIL: Could not write the Data Protection volume" >&2
  exit 1
fi

key_checksums() {
  docker compose exec -T api sh -c \
    'find /app/keys -maxdepth 1 -type f -name "key-*.xml" -exec sha256sum {} \;' | sort
}
keys_before="$(key_checksums)"

docker compose restart api > /dev/null

status="000"
for attempt in {1..30}; do
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --max-time 5 "$BASE/api/v1/health/live")" || status="000"
  [[ "$status" == "200" ]] && break
  sleep 2
done
if [[ "$status" != "200" ]]; then
  echo "FAIL: API did not become healthy after restart (HTTP $status)" >&2
  exit 1
fi

after="$(docker compose exec -T api sh -c "sha256sum /app/keys/$probe" | tr -d '\r')"
if [[ "$before" != "$after" ]]; then
  echo "FAIL: Data Protection volume content did not survive API restart" >&2
  exit 1
fi
if [[ "$(key_checksums)" != "$keys_before" ]]; then
  echo "FAIL: Existing Data Protection key files changed across API restart" >&2
  exit 1
fi

echo "PASS: API can write the Data Protection volume and content survives restart"
