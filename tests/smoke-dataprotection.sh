#!/usr/bin/env bash
# Confirm antiforgery/Data Protection key material persists across API restarts.
# This checks the key ring, not a successful login (the DB is not migrated here).
set -euo pipefail

BASE="${1:-http://localhost:8080}"

# Requesting a CSRF token forces ASP.NET Core to initialize the key ring.
curl --fail --silent --show-error --retry 10 --retry-delay 1 --retry-connrefused \
  "$BASE/api/v1/auth/csrf" > /dev/null

key_checksums() {
  docker compose exec -T api sh -c \
    'find /app/keys -maxdepth 1 -type f -name "key-*.xml" -exec sha256sum {} \;' | sort
}

before="$(key_checksums)"
if [[ -z "$before" ]]; then
  echo "FAIL: No persisted Data Protection key was created" >&2
  exit 1
fi

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

after="$(key_checksums)"
if [[ "$before" != "$after" ]]; then
  echo "FAIL: Data Protection key files changed or disappeared after restart" >&2
  exit 1
fi
echo "PASS: Data Protection key files survive API restart"
