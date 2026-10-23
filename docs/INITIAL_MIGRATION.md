# Initial EF Core migration

The initial migration is committed under `services/api/Infrastructure/Persistence/Migrations/`.
It creates users, invite tokens, characters, four constrained character attributes,
wallets and wallet transactions, with their foreign keys and uniqueness constraints.
Do not generate another `InitialCreate` migration.

## Apply to an existing or new database

Use the .NET 10 SDK, Docker, and a properly configured PostgreSQL connection string.
From the repository root:

```bash
docker compose up -d postgres
dotnet tool restore
export ConnectionStrings__GameDb='Host=localhost;Port=5432;Database=thelastdecision;Username=tld;Password=<your-local-password>'
dotnet ef database update --project services/api --startup-project services/api
docker compose up --build -d
bash tests/smoke-post-migration.sh
```

The password must match your local `.env` file; do not commit real credentials.
Migration application is a deliberate deployment step, not an API startup side effect.
`/api/v1/health/ready` must return HTTP 503 until the database is migrated,
then HTTP 200 when all known migrations are applied.

## Future schema changes

After modifying `GameDbContext` or entity types, create a *new* named migration:

```bash
dotnet ef migrations add DescriptiveChange --project services/api --startup-project services/api --output-dir Infrastructure/Persistence/Migrations
```

Commit the generated migration, designer, and updated model snapshot together.
The CI migration-validation job checks for pending model changes and applies the
committed migrations against disposable PostgreSQL. It is not a substitute for
application-level integration tests, backup/restore procedures, or deployment rehearsal.

## Data safety

Never run `docker compose down -v` on a database with data you want to retain.
Review destructive migrations and take a backup before applying them to persistent data.
