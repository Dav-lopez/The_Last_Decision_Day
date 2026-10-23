#!/usr/bin/env bash
# Validate the EF model and apply migrations to a disposable PostgreSQL database.
# Run from repository root. Requires .NET 10 SDK, dotnet-ef and PostgreSQL.
set -euo pipefail

PROJECT="services/api/TheLastDecision.Api.csproj"
MIGRATIONS="services/api/Infrastructure/Persistence/Migrations"
dotnet tool restore

if find "$MIGRATIONS" -maxdepth 1 -name '*_InitialCreate.cs' -print -quit 2>/dev/null | grep -q .; then
  echo "Using the committed initial migration."
  # Fail CI if entity changes are made without an accompanying migration.
  dotnet ef migrations has-pending-model-changes --project "$PROJECT" --startup-project "$PROJECT"
else
  echo "No committed initial migration found. Generating a temporary migration for validation."
  dotnet ef migrations add InitialCreate --project "$PROJECT" --startup-project "$PROJECT" \
    --output-dir Infrastructure/Persistence/Migrations
fi

dotnet ef database update --project "$PROJECT" --startup-project "$PROJECT"
echo "Migration model validation and database update completed."
