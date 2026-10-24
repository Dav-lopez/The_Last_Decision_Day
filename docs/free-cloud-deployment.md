# Free cloud development deployment (manual provisioning)

Architecture: Cloudflare Pages (React/Phaser and same-origin /api proxy) → HTTPS → Oracle Cloud Always Free VM (Caddy → ASP.NET Core 10) → TLS → Neon PostgreSQL. No local Docker required. The optional Docker CI checks remain unchanged.

**Not production certified:** Invitation-only registration, session security, browser tests, real-time SignalR, full gameplay, database backup/restore, and deployment hardening still require verification. Do not advertise a public playable release.

## 1. Neon (free PostgreSQL)
1. Sign up at https://console.neon.tech/ and create a project on the Free plan, preferably near your OCI region.
2. Copy the **direct** PostgreSQL connection string (not a pooled connection string for EF migrations). Keep it private. For Npgsql, configure a connection string such as `Host=...;Database=...;Username=...;Password=...;SSL Mode=VerifyFull`. Use Neon's TLS instructions and certificate verification where supported.
3. Never put credentials in GitHub commits, Pages environment variables, frontend code, or screenshots. Store the connection string only in the VM environment file.

## 2. Oracle Cloud VM (Always Free eligible)
1. Register at https://cloud.oracle.com/ and create an Always Free-eligible Ubuntu VM in your **home region**. Ampere A1 Arm64 or E2 Micro x64 can work; match the .NET runtime identifier to your VM architecture. Capacity is not guaranteed; never select a paid shape by accident.
2. Add an SSH public key; restrict SSH port 22 to your IP in OCI network rules. Allow inbound TCP 80/443 for Caddy. Do not expose port 5000 or PostgreSQL.
3. SSH to the VM. Install .NET 10 SDK (for EF tooling), Caddy, and Git from official repositories. Ensure Ubuntu architecture is supported. Install `dotnet-ef` via the repository's tool manifest (`dotnet tool restore`).
4. Set DNS A record for a hostname you control (e.g. `api.example.com`) to the VM public IPv4 address. **No paid domain required:** an available free subdomain from https://www.duckdns.org/ (e.g. `your-tld-api.duckdns.org`) can point to the VM public IP; create the name in DuckDNS and update its IP to the VM address. Keep your DuckDNS token private. Replace `api.example.com` in the Caddy configuration and Pages `API_ORIGIN` with that exact hostname. Caddy obtains HTTPS certificates once DNS and ports 80/443 are working. Certificate issuance and free hostname availability are not guaranteed.
5. Create a dedicated non-login user and restricted directories:
   ```bash
   sudo useradd --system --home /opt/the-last-decision --shell /usr/sbin/nologin tld
   sudo install -d -o tld -g tld /opt/the-last-decision/api
   sudo install -d -o tld -g tld -m 700 /var/lib/the-last-decision/keys
   sudo install -d -m 700 /etc/the-last-decision
   sudo touch /etc/the-last-decision/api.env
   sudo chmod 600 /etc/the-last-decision/api.env
   ```
6. Add the following line to `/etc/the-last-decision/api.env` with the **real** Neon connection string (do not commit this file):
   ```ini
   ConnectionStrings__GameDb=Host=YOUR_HOST;Database=YOUR_DB;Username=YOUR_USER;Password=YOUR_PASSWORD;SSL Mode=VerifyFull
   DataProtection__KeysDirectory=/var/lib/the-last-decision/keys
   ```
   Protect the environment file with root ownership. Avoid shell history containing passwords. The data-protection key ring is persisted in a service-user-only directory so cookie sessions survive VM restarts; back up the keys securely and protect them at rest. EF migration commands need the database connection string but not the key directory.
7. Clone the repository to a temporary working directory on the VM. After PR merge, build the API for your architecture:
   ```bash
   dotnet restore services/api/TheLastDecision.Api.csproj
   dotnet publish services/api/TheLastDecision.Api.csproj -c Release -r linux-arm64 --self-contained true -o /tmp/tld-publish
   ```
   Use `linux-x64` instead for an x64 VM. Copy published files to `/opt/the-last-decision/api` and set ownership to `tld:tld`.
8. Apply **reviewed** migrations using the repository's EF tool in the source checkout with the Neon connection string provided securely in the environment. Do not use `EnsureCreated`, automatic destructive migration, or run migration against the wrong database. Take a backup/snapshot first when upgrading a nonempty database.
9. Copy `deploy/oci/the-last-decision.service` to `/etc/systemd/system/`; run `sudo systemctl daemon-reload && sudo systemctl enable --now the-last-decision`. Inspect `sudo journalctl -u the-last-decision -n 100 --no-pager`.
10. Install `deploy/oci/Caddyfile.example` as `/etc/caddy/Caddyfile`, replace the hostname, and reload Caddy. Confirm `https://api.example.com/api/v1/health/live` returns 200 and `.../ready` returns 200 after migrations. A 503 indicates the DB/schema is not ready. Keep the raw API hostname private where possible; the API currently does not enforce Cloudflare-only traffic.

## 3. Cloudflare Pages (free)
1. Sign up at https://dash.cloudflare.com/ → Workers & Pages → Create → Pages → Connect to Git.
2. Authorize **only** `Dav-lopez/The_Last_Decision_Day`. Set production branch to `main` after reviewing and merging this PR; PR branches can generate preview deployments.
3. Root directory: `apps/web`; build command: `npm run build`; output directory: `dist`; set `NODE_VERSION=22`.
4. Add Pages environment variable `API_ORIGIN=https://api.example.com` (no trailing path). This is an origin, **not a secret**. Set it separately for production and preview environments.
5. Pages Functions under `apps/web/functions/api/[[path]].ts` forward same-origin `/api/*` requests to the configured HTTPS backend. Authentication cookies stay on the Pages domain, avoiding cross-site cookie issues. **Do not add a browser-side database credential or change fetch to a cross-origin API URL.**
6. Deploy. Verify `https://YOUR_PROJECT.pages.dev/api/v1/health/live` and `.../ready` are 200, then test login, CSRF, invitation registration, character creation and school preview manually. School execution, history, and daily UTC time-budget UI are present, but still require browser-based integration verification.
7. Cloudflare preview branches must not share production data for destructive testing. Prefer a separate Neon development branch/database and corresponding staging API before enabling external testers.

## 4. Security and limitations
- Cloudflare Pages Functions proxy uses a fixed HTTPS origin; no user-controlled destination. Do not point it at untrusted servers. Redirects are not followed automatically.
- The API is served over Caddy HTTPS; its .NET listener is bound to localhost. ASP.NET Core accepts only one forwarded hop from the loopback Caddy proxy; never expose port 5000 or add untrusted proxies to the allowlist. Caddy must remain the only HTTP ingress to the API. Review origin validation before broad public access.
- **Rate-limit limitation:** When Cloudflare Pages Functions forwards requests to Caddy, the observed remote address may be a Cloudflare egress address rather than the original browser IP. Multiple players could therefore share an unauthenticated auth rate-limit bucket. Do not trust browser-provided `X-Forwarded-For` or `CF-Connecting-IP` without a separately verified trusted-proxy chain. Plan Cloudflare edge rate limiting and abuse testing before public launch.
- The current API uses secure SameSite=Strict cookies; same-origin Pages proxy preserves the intended cookie model for HTTP requests. SignalR `/hubs/world` is **not proxied by this increment** and needs separate WebSocket support and authentication validation.
- No automatic backend deploy or secrets distribution is configured. Deploying is manual until a secure SSH-based workflow is reviewed.
- Cloudflare Pages Free has monthly build limits; Neon Free has compute/storage limits; OCI Always Free VM allocation depends on region capacity and account eligibility. Check provider dashboards before incurring any charges.
- The VM and database are not yet provisioned by this PR. CI builds and migrations against disposable test PostgreSQL do not prove a live cloud deployment.

## 5. School time-budget behavior

Each character has eight school time units per UTC day. Successful actions consume their catalog cost (one or two units) and are counted from committed idempotency records; a retry using the same key replays the original response without charging again. The server checks the remaining balance inside a serializable transaction before saving an action. The browser displays the remaining balance from authenticated `GET /api/v1/school/time` and offers a refresh control. Existing activities completed earlier in the same UTC day count toward the allowance. No EF schema change is required.

Manual integration tests still needed: run actions until exhausted, retry an earlier idempotency key, attempt concurrent actions with distinct keys near the limit, confirm reset at UTC midnight, verify another account cannot see the budget, and check the UI after refresh/relogin. A successful CI build alone does not prove these behaviors.

## 6. Cloudflare proxy validation before merging

The web CI job runs `node --test tests/pages-proxy.test.mjs` to check API URL forwarding, cookies/CSRF headers, and fail-closed origin validation. It also runs `npx --yes wrangler@4.45.0 pages functions build functions --outfile /tmp/tld-pages-worker.mjs` to compile the Pages Function. These checks do not replace an actual Pages deployment test. For optional local Pages emulation after `npm run build`, run `npx wrangler pages dev dist --binding=API_ORIGIN=https://YOUR_API_HOSTNAME` from `apps/web`; it does not require local Docker when the backend is already hosted.
