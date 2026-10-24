using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Text.Json;
using TheLastDecision.Api;
using TheLastDecision.Api.Identity;
using TheLastDecision.Api.School;

var connection = Environment.GetEnvironmentVariable("ConnectionStrings__GameDb");
if (string.IsNullOrWhiteSpace(connection))
    throw new InvalidOperationException("Integration tests require ConnectionStrings__GameDb (disposable PostgreSQL only).");
var builder = new NpgsqlConnectionStringBuilder(connection);
if (!builder.Database.Contains("ci", StringComparison.OrdinalIgnoreCase) &&
    !builder.Database.Contains("test", StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException("Refusing to run integration tests outside a test/CI database.");

var options = new DbContextOptionsBuilder<GameDbContext>().UseNpgsql(connection).Options;
await using var db = new GameDbContext(options);
// Fixed identifiers are used only in the disposable CI database for the
// pre-migration backfill rehearsal.
var legacyCharacterId = Guid.Parse("b1a1f41c-46d9-42a8-a35d-99b06700c101");
var legacyCorrelationId = Guid.Parse("b1a1f41c-46d9-42a8-a35d-99b06700c102");
if (args.Contains("--seed-legacy-school"))
{
    var legacyUser = new GameUser {
        Id = Guid.Parse("b1a1f41c-46d9-42a8-a35d-99b06700c100"),
        EmailNormalized = "LEGACY-SCHOOL-BACKFILL@EXAMPLE.TEST",
        PasswordHash = "test-only-hash",
        DateOfBirth = new DateOnly(1990, 1, 1)
    };
    db.Users.Add(legacyUser);
    db.Characters.Add(new Character {
        Id = legacyCharacterId, UserId = legacyUser.Id, DisplayName = "Legacy School"
    });
    var legacyResult = new SchoolExecutionResult("study", 2,
        new Dictionary<string, int> { ["Intelligence"] = 20 },
        new Dictionary<string, int> { ["Intelligence"] = 25 },
        legacyCorrelationId);
    db.IdempotencyRecords.Add(new IdempotencyRecord {
        Scope = "school:" + legacyCharacterId.ToString("N"),
        Key = Guid.NewGuid().ToString("N"),
        RequestHash = "legacy-school-backfill-test",
        CorrelationId = legacyCorrelationId,
        CreatedAt = new DateTimeOffset(2026, 10, 24, 16, 0, 0, TimeSpan.Zero),
        ResponseJson = JsonSerializer.Serialize(legacyResult,
            new JsonSerializerOptions(JsonSerializerDefaults.Web))
    });
    await db.SaveChangesAsync();
    Console.WriteLine("Seeded legacy completed school action before ledger migration.");
    return;
}
if ((await db.Database.GetPendingMigrationsAsync()).Any())
    throw new InvalidOperationException("Apply committed migrations before running integration tests.");

static void Check(bool ok, string name)
{
    if (!ok) throw new Exception("FAIL: " + name);
    Console.WriteLine("PASS: " + name);
}

if (Environment.GetEnvironmentVariable("TEST_LEGACY_BACKFILL") == "1")
{
    var migrated = await db.SchoolActivityExecutions.AsNoTracking()
        .SingleOrDefaultAsync(x => x.CorrelationId == legacyCorrelationId);
    Check(migrated is not null && migrated.CharacterId == legacyCharacterId &&
        migrated.ActivityId == "study" && migrated.TimeCost == 2,
        "Committed migration backfills the historical action with original charged time");
    var historical = migrated is null ? null : SchoolHistoryEndpoints.Parse(migrated);
    Check(historical is not null && historical.Before["Intelligence"] == 20 &&
        historical.After["Intelligence"] == 25,
        "Backfilled school action preserves original attribute snapshots");
    var historicalTime = await SchoolTimeBudget.LoadAsync(db, legacyCharacterId,
        new DateTimeOffset(2026, 10, 24, 16, 1, 0, TimeSpan.Zero), CancellationToken.None);
    Check(historicalTime.Spent == 2,
        "Backfilled school action counts toward its original UTC-day time budget");
}

var scope = "school:" + Guid.NewGuid().ToString("N");
var key = Guid.NewGuid().ToString("N");
var first = new IdempotencyRecord {
    Scope = scope, Key = key, RequestHash = "integration-request",
    CorrelationId = Guid.NewGuid(), ResponseJson = "{\"activityId\":\"study\"}"
};
await using (var transaction = await db.Database.BeginTransactionAsync())
{
    db.IdempotencyRecords.Add(first);
    await db.SaveChangesAsync();
    var readBack = await db.IdempotencyRecords.AsNoTracking().SingleAsync(x => x.Scope == scope && x.Key == key);
    Check(readBack.CorrelationId == first.CorrelationId && readBack.ResponseJson == first.ResponseJson,
        "Committed-shaped school idempotency record is queryable inside transaction");
    await transaction.RollbackAsync();
}
db.ChangeTracker.Clear();
Check(!await db.IdempotencyRecords.AnyAsync(x => x.Scope == scope && x.Key == key),
    "Rolled-back gameplay record is absent in fresh query");

await using (var transaction = await db.Database.BeginTransactionAsync())
{
    db.IdempotencyRecords.Add(new IdempotencyRecord {
        Scope = scope, Key = key, RequestHash = "integration-request", CorrelationId = Guid.NewGuid()
    });
    await db.SaveChangesAsync();
    db.ChangeTracker.Clear();
    db.IdempotencyRecords.Add(new IdempotencyRecord {
        Scope = scope, Key = key, RequestHash = "integration-request", CorrelationId = Guid.NewGuid()
    });
    try
    {
        await db.SaveChangesAsync();
        throw new Exception("FAIL: duplicate idempotency key was accepted");
    }
    catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == PostgresErrorCodes.UniqueViolation)
    {
        Console.WriteLine("PASS: PostgreSQL rejects duplicate school idempotency key");
    }
    await transaction.RollbackAsync();
}
db.ChangeTracker.Clear();
Check(!await db.IdempotencyRecords.AnyAsync(x => x.Scope == scope),
    "Duplicate-key failure does not persist partial gameplay writes");

// Assert that the committed migration created the physical PostgreSQL index.
await using (var indexConnection = new NpgsqlConnection(connection))
{
    await indexConnection.OpenAsync();
    await using var indexCommand = new NpgsqlCommand(
        "SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() " +
        "AND tablename = 'IdempotencyRecords' " +
        "AND indexname = 'IX_IdempotencyRecords_Scope_CreatedAt_Id'", indexConnection);
    var indexDefinition = (string?)await indexCommand.ExecuteScalarAsync();
    Check(indexDefinition is not null &&
        indexDefinition.Contains(@"""Scope""", StringComparison.Ordinal) &&
        indexDefinition.Contains(@"""CreatedAt"" DESC", StringComparison.Ordinal) &&
        indexDefinition.Contains(@"""Id"" DESC", StringComparison.Ordinal),
        "PostgreSQL has scope-prefixed, newest-first school read index");
}

// Durable execution rows must remain queryable after retry records are removed.
var testUser = new GameUser {
    EmailNormalized = "SCHOOL-" + Guid.NewGuid().ToString("N") + "@EXAMPLE.TEST",
    PasswordHash = "test-only-hash",
    DateOfBirth = new DateOnly(1990, 1, 1)
};
var testCharacter = new Character { UserId = testUser.Id, DisplayName = "School Test" };
var completedAt = DateTimeOffset.UtcNow;
var correlation = Guid.NewGuid();
await using (var transaction = await db.Database.BeginTransactionAsync())
{
    db.Users.Add(testUser);
    db.Characters.Add(testCharacter);
    var action = new SchoolActivityExecution {
        CharacterId = testCharacter.Id,
        ActivityId = "retired-activity",
        TimeCost = 3,
        CorrelationId = correlation,
        CreatedAt = completedAt,
        BeforeJson = "{\"Intelligence\":20}",
        AfterJson = "{\"Intelligence\":25}"
    };
    db.SchoolActivityExecutions.Add(action);
    var retry = new IdempotencyRecord {
        Scope = "school:" + testCharacter.Id.ToString("N"),
        Key = Guid.NewGuid().ToString("N"),
        RequestHash = "integration-request",
        CorrelationId = correlation,
        CreatedAt = completedAt,
        ResponseJson = "{}"
    };
    db.IdempotencyRecords.Add(retry);
    await db.SaveChangesAsync();
    db.ChangeTracker.Clear();

    var balance = await SchoolTimeBudget.LoadAsync(db, testCharacter.Id, completedAt, CancellationToken.None);
    Check(balance.Spent == 3 && balance.Remaining == 5,
        "Daily time derives from durable completed actions, including retired catalog items");
    var historyRow = await db.SchoolActivityExecutions.AsNoTracking()
        .SingleAsync(x => x.CorrelationId == correlation);
    var historyEntry = SchoolHistoryEndpoints.Parse(historyRow);
    Check(historyEntry is not null && historyEntry.ActivityId == "retired-activity" &&
        historyEntry.Before["Intelligence"] == 20 && historyEntry.After["Intelligence"] == 25,
        "Durable school history preserves attribute snapshots");

    db.IdempotencyRecords.Remove(await db.IdempotencyRecords.SingleAsync(x => x.Id == retry.Id));
    await db.SaveChangesAsync();
    db.ChangeTracker.Clear();
    balance = await SchoolTimeBudget.LoadAsync(db, testCharacter.Id, completedAt, CancellationToken.None);
    Check(balance.Spent == 3 && await db.SchoolActivityExecutions.AnyAsync(x => x.CorrelationId == correlation),
        "Purging retry protection cannot erase completed school time or history");
    await transaction.RollbackAsync();
}
db.ChangeTracker.Clear();
Check(!await db.SchoolActivityExecutions.AnyAsync(x => x.CorrelationId == correlation),
    "Rolling back school execution transaction removes durable action");
await using (var indexConnection = new NpgsqlConnection(connection))
{
    await indexConnection.OpenAsync();
    await using var indexCommand = new NpgsqlCommand(
        "SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() " +
        "AND tablename = 'SchoolActivityExecutions' " +
        "AND indexname = 'IX_SchoolActivityExecutions_CharacterId_CreatedAt_Id'", indexConnection);
    var indexDefinition = (string?)await indexCommand.ExecuteScalarAsync();
    Check(indexDefinition is not null &&
        indexDefinition.Contains(@"""CharacterId""", StringComparison.Ordinal) &&
        indexDefinition.Contains(@"""CreatedAt"" DESC", StringComparison.Ordinal) &&
        indexDefinition.Contains(@"""Id"" DESC", StringComparison.Ordinal),
        "Durable school history has a per-character newest-first PostgreSQL index");
}

Console.WriteLine("PostgreSQL gameplay persistence integration checks passed.");
