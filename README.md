# The Last Decision

An in-development life-simulation prototype using ASP.NET Core 10, EF Core, PostgreSQL, SignalR, React, TypeScript and Phaser. Current features include invitation-based identity, character creation, starter attributes and audit records, and **school activity previews**. A complete playable gameplay loop is not yet implemented.

## Cloud development (no local Docker required)

Follow [the free cloud deployment guide](docs/free-cloud-deployment.md) for Cloudflare Pages, Neon PostgreSQL and an eligible Oracle Cloud Always Free VM. Cloud accounts, a DNS hostname and manual backend provisioning are required. This repository does not automatically provision or deploy those services.

## Optional Windows Docker development

Install Git for Windows, Docker Desktop (Linux containers), .NET 10 SDK and Node.js 22.

```powershell
Copy-Item .env.example .env
docker compose up --build -d
.\tests\smoke-pre-migration.ps1
```

Open http://localhost:8080. Before applying migrations, the liveness endpoint should return 200 and readiness should return 503.

### Apply existing committed migrations

**Do not regenerate the initial migration.** The EF migrations are committed to the repository. Start PostgreSQL and configure the connection string for the host environment before applying:

```powershell
dotnet tool restore
docker compose up -d postgres
$env:ConnectionStrings__GameDb = "Host=localhost;Port=5432;Database=thelastdecision;Username=tld;Password=change-this-local-password"
dotnet ef database update --project services/api
```

Use the actual credentials from your local `.env` file. After applying migrations, `/api/v1/health/ready` should return HTTP 200. Do not use `docker compose down -v` unless you intend to delete local database data.

## CI and readiness

GitHub Actions builds and tests the API and frontend, runs Docker smoke checks, and validates committed migrations against disposable PostgreSQL. The cloud deployment PR also adds Cloudflare Pages proxy tests and a Functions bundling check. CI success **does not** prove a deployed cloud environment or end-to-end gameplay readiness.

**Security:** The development stack must not be exposed publicly without reviewing HTTPS, invitations, session security, API access, secrets, backups, and deployment configuration. Never commit `.env` or cloud credentials.
