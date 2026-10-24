using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace TheLastDecision.Api.School;

/// <summary>
/// Daily UTC school time is derived from committed activity records. The calculation
/// must run inside the execution transaction to prevent concurrent overspending.
/// </summary>
public sealed record SchoolTimeBalance(int DailyLimit, int Spent, int Remaining, DateTimeOffset ResetsAt);

public static class SchoolTimeBudget
{
    public const int DailyLimit = 8;

    public static DateTimeOffset StartOfUtcDay(DateTimeOffset now) =>
        new(now.UtcDateTime.Date, TimeSpan.Zero);

    public static SchoolTimeBalance Calculate(IEnumerable<SchoolActivityHistoryEntry> history, DateTimeOffset now)
    {
        var spent = 0;
        foreach (var entry in history)
        {
            var activity = SchoolActivities.Catalog.FirstOrDefault(a => a.Id == entry.ActivityId);
            // Fail closed if a persisted execution is malformed; do not grant free time.
            if (activity is null || entry.TimeCost != activity.TimeCost || entry.TimeCost <= 0)
                throw new InvalidDataException("Invalid saved school activity.");
            spent = checked(spent + entry.TimeCost);
        }
        return new SchoolTimeBalance(DailyLimit, spent, Math.Max(0, DailyLimit - spent),
            StartOfUtcDay(now).AddDays(1));
    }

    public static bool CanExecute(SchoolTimeBalance balance, SchoolActivity activity) =>
        activity.TimeCost > 0 && balance.Remaining >= activity.TimeCost;

    public static async Task<SchoolTimeBalance> LoadAsync(
        GameDbContext db, Guid characterId, DateTimeOffset now, CancellationToken ct)
    {
        var start = StartOfUtcDay(now);
        var end = start.AddDays(1);
        var scope = "school:" + characterId.ToString("N");
        var records = await db.IdempotencyRecords.AsNoTracking()
            .Where(r => r.Scope == scope && r.CreatedAt >= start && r.CreatedAt < end)
            .ToListAsync(ct);
        var history = new List<SchoolActivityHistoryEntry>(records.Count);
        foreach (var record in records)
        {
            var parsed = SchoolHistoryEndpoints.Parse(record);
            if (parsed is null)
                throw new InvalidDataException("Invalid saved school activity.");
            history.Add(parsed);
        }
        return Calculate(history, now);
    }

    public static void MapSchoolTimeEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/school/time", async (
            ClaimsPrincipal principal, GameDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
                return Results.Unauthorized();
            var characterId = await db.Characters.AsNoTracking()
                .Where(c => c.UserId == userId)
                .Select(c => (Guid?)c.Id)
                .SingleOrDefaultAsync(ct);
            if (characterId is null)
                return Results.NotFound(new { error = "Create a character first." });
            try
            {
                return Results.Ok(await LoadAsync(db, characterId.Value, DateTimeOffset.UtcNow, ct));
            }
            catch (InvalidDataException)
            {
                return Results.Conflict(new { error = "Saved school time could not be verified." });
            }
        }).RequireAuthorization();
    }
}
