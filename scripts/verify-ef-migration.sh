#!/usr/bin/env bash
# Validate the current EF model against a disposable PostgreSQL database.
# Run from repository root. Requires .NET 10 SDK, dotnet-ef and PostgreSQL.
set -euo pipefail
PROJECT="services/api/TheLastDecision.Api.csproj"
MIGRATIONS="Infrastructure/Persistence/Migrations"
if find services/api/Infrastructure/Persistence/Migrations -maxdepth 1 -name '*_InitialCreate.cs' -print -quit 2>/dev/null | grep -q .; then
  echo "An initial migration already exists. Refusing to generate a duplicate." >&2
  exit 1
fi
dotnet tool restore
dotnet ef migrations add InitialCreate --project "$PROJECT" --startup-project "$PROJECT" --output-dir "$MIGRATIONS"
dotnet ef database update --project "$PROJECT" --startup-project "$PROJECT"
echo "Migration generated and applied successfully. Review and commit the generated migration and model snapshot."
