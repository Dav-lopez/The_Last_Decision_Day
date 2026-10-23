# Initial EF Core migration

The current repository has **no committed EF Core initial migration**. Readiness must remain HTTP 503 until the schema is initialized.

## Generate and verify

With .NET 10 SDK, Docker Desktop and the repository root as your working directory:

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
dotnet tool restore
$env:ConnectionStrings__GameDb = "Host=localhost;Port=5432;Database=thelastdecision;Username=tld;Password=change-this-local-password"
dotnet ef migrations add InitialCreate --project services/api --startup-project services/api --output-dir Infrastructure/Persistence/Migrations
dotnet ef database update --project services/api --startup-project services/api
docker compose up --build -d
```

Replace the example password with your own local database credentials. Ensure it matches your .env configuration.

Inspect the generated migration for Character, CharacterAttribute, Wallet and WalletTransaction tables, their keys, foreign keys, uniqueness constraints, and check constraints. Commit both the migration and the EF model snapshot. Do not generate a second InitialCreate migration.

## Validation

Run the pre-migration smoke test against a fresh database before applying migrations. Once applied, run `bash tests/smoke-post-migration.sh` or inspect `/api/v1/health/ready` for HTTP 200. Avoid `docker compose down -v` unless intentionally deleting local data.

**Note:** These instructions are not a substitute for a committed migration; do not mark this milestone complete until the generated files and integration tests are present.
