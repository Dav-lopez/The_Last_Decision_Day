# The Last Decision

Day 1 infrastructure scaffold for a planned life-simulation game: ASP.NET Core 10, EF Core, PostgreSQL, SignalR, React, TypeScript, Phaser, nginx, and Docker Compose.

## Windows prerequisites

Install Git for Windows, Docker Desktop (Linux containers), .NET 10 SDK, and Node.js 22. Open PowerShell at the repository root.

```powershell
Copy-Item .env.example .env
docker compose up --build -d
.\tests\smoke-pre-migration.ps1
```

Open http://localhost:8080. Before the first migration, the API liveness endpoint returns HTTP 200 and readiness returns HTTP 503. This is expected; the database is reachable but the schema has not been initialized.

## Database migrations

```powershell
dotnet tool restore
.\scripts\add-initial-migration.ps1
docker compose up -d postgres
dotnet ef database update --project services/api
```

The migration-generation step creates source files that **must be reviewed and committed**. The local database must be available when applying migrations. After applying the migration, readiness should return HTTP 200. Never use `docker compose down -v` unless intentionally deleting your local PostgreSQL data.

## CI and development status

GitHub Actions builds the API and frontend, verifies the EF CLI tool, and performs a Docker Compose pre-migration smoke test. The tests do **not** demonstrate that migrations apply or that gameplay works. A committed initial migration, migration integration tests, authentication, authorization, invite/18+ registration, wallet transactions, and progression remain future milestones.

**Security:** Local development only. Do not expose this stack publicly or commit the `.env` file.
