using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace TheLastDecision.Api.School;

public sealed record SchoolActivityHistoryEntry(
    string ActivityId,
    int TimeCost,
    IReadOnlyDictionary<string, int> Before,
    IReadOnlyDictionary<string, int> After,
    Guid CorrelationId,
    DateTimeOffset CompletedAt);

public static class SchoolHistoryEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const int MaxHistoryItems = 20;

    public static void MapSchoolHistoryEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/school/history", GetHistory)
            .RequireAuthorization();
    }

    private static async Task<IResult> GetHistory(
        ClaimsPrincipal principal, GameDbContext db, ILoggerFactory loggerFactory, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return Results.Unauthorized();

        var characterId = await db.Characters.AsNoTracking()
            .Where(c => c.UserId == userId)
            .Select(c => (Guid?)c.Id)
            .SingleOrDefaultAsync(ct);
        if (characterId is null)
            return Results.NotFound(new { error = "Create a character first." });

        // Durable history survives idempotency-key retention and catalog changes.
        var records = await db.SchoolActivityExecutions.AsNoTracking()
            .Where(r => r.CharacterId == characterId.Value)
            .OrderByDescending(r => r.CreatedAt)
            .ThenByDescending(r => r.Id)
            .Take(MaxHistoryItems)
            .ToListAsync(ct);

        var history = new List<SchoolActivityHistoryEntry>(records.Count);
        foreach (var record in records)
        {
            var entry = Parse(record);
            if (entry is not null)
                history.Add(entry);
            else
                loggerFactory.CreateLogger("SchoolHistory")
                    .LogWarning("Skipping malformed school history record {RecordId}", record.Id);
        }

        return Results.Ok(history);
    }

    // Parse persisted snapshots; no lookup against the current catalog.
    public static SchoolActivityHistoryEntry? Parse(SchoolActivityExecution record)
    {
        try
        {
            var before = JsonSerializer.Deserialize<Dictionary<string, int>>(record.BeforeJson, JsonOptions);
            var after = JsonSerializer.Deserialize<Dictionary<string, int>>(record.AfterJson, JsonOptions);
            if (before is null || after is null || string.IsNullOrWhiteSpace(record.ActivityId) ||
                record.TimeCost <= 0 || record.TimeCost > SchoolTimeBudget.DailyLimit ||
                record.CorrelationId == Guid.Empty)
                return null;
            return new SchoolActivityHistoryEntry(record.ActivityId, record.TimeCost,
                before, after, record.CorrelationId, record.CreatedAt);
        }
        catch (JsonException) { return null; }
    }

    // Legacy parser retained for regression coverage and migration diagnostics.
    public static SchoolActivityHistoryEntry? Parse(IdempotencyRecord record)
    {
        if (string.IsNullOrWhiteSpace(record.ResponseJson))
            return null;
        try
        {
            var result = JsonSerializer.Deserialize<SchoolExecutionResult>(record.ResponseJson, JsonOptions);
            if (result is null || string.IsNullOrWhiteSpace(result.ActivityId) ||
                result.Before is null || result.After is null ||
                result.CorrelationId == Guid.Empty || result.CorrelationId != record.CorrelationId)
                return null;
            return new SchoolActivityHistoryEntry(
                result.ActivityId, result.TimeCost, result.Before, result.After,
                result.CorrelationId, record.CreatedAt);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
