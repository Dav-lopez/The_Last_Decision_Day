# Day 1 foundation validation

## Before merge
1. Run `dotnet restore services/api/TheLastDecision.Api.csproj` and `dotnet build services/api/TheLastDecision.Api.csproj`.
2. Run `cd apps/web && npm install && npm run typecheck && npm run build`.
3. Generate the initial EF Core migration using `dotnet ef migrations add InitialCreate --project services/api --output-dir Infrastructure/Persistence/Migrations`. Commit the generated migration **and model snapshot**.
4. Start PostgreSQL with `docker compose up -d postgres`, set `ConnectionStrings__GameDb` for localhost, and run `dotnet ef database update --project services/api`.
5. Run `docker compose up --build`. Verify live health is 200, ready health is 200 after migration and 503 without migration.
6. Commit an npm lockfile and change CI/web Dockerfile to `npm ci` for reproducible installs.

## Current limitations
- Not a playable beta; no authentication, invite flow, DOB validation, moderation, or gameplay.
- The wallet balance is still a mutable projection without ledger-enforced write APIs.
- No test suite is committed. CI/build results must be inspected.
- Do not expose this service publicly or merge without build verification.
