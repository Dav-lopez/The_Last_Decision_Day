using Microsoft.EntityFrameworkCore;
using Npgsql;
using TheLastDecision.Api;

var connection = Environment.GetEnvironmentVariable("ConnectionStrings__GameDb");
if (string.IsNullOrWhiteSpace(connection))
    throw new InvalidOperationException("Integration tests require ConnectionStrings__GameDb (disposable PostgreSQL only).");
var builder = new NpgsqlConnectionStringBuilder(connection);
if (!builder.Database.Contains("ci", StringComparison.OrdinalIgnoreCase) &&
    !builder.Database.Contains("test", StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException("Refusing to run integration tests outside a test/CI database.");

var options = new DbContextOptionsBuilder<GameDbContext>().UseNpgsql(connection).Options;
await using var db = new GameDbContext(options);
if ((await db.Database.GetPendingMigrationsAsync()).Any())
    throw new InvalidOperationException("Apply committed migrations before running integration tests.");

static void Check(bool ok, string name)
{
    if (!ok) throw new Exception("FAIL: " + name);
    Console.WriteLine("PASS: " + name);
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
        indexDefinition.Contains("\\\"Scope\\\"", StringComparison.Ordinal) &&
        indexDefinition.Contains("\\\"CreatedAt\\\" DESC", StringComparison.Ordinal) &&
        indexDefinition.Contains("\\\"Id\\\" DESC", StringComparison.Ordinal),
        "PostgreSQL has scope-prefixed, newest-first school read index");
}

Console.WriteLine("PostgreSQL gameplay persistence integration checks passed.");
