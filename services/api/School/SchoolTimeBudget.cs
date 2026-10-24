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

    public static SchoolTimeBalance Calculate(IEnumerable<SchoolActivityHistoryEntry> history, DateTimeOffset now) =>
        CalculateCharges(history.Select(e => (e.ActivityId, e.TimeCost)), now);

    public static SchoolTimeBalance CalculateCharges(
        IEnumerable<(string ActivityId, int TimeCost)> charges, DateTimeOffset now)
    {
        var spent = 0;
        foreach (var (activityId, timeCost) in charges)
        {
            // Historical costs are immutable even if the catalog changes.
            if (string.IsNullOrWhiteSpace(activityId) || timeCost <= 0 || timeCost > DailyLimit)
                throw new InvalidDataException("Invalid saved school activity.");
            try { spent = checked(spent + timeCost); }
            catch (OverflowException) { throw new InvalidDataException("Invalid saved school time total."); }
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
        // Durable rows are the source of truth; retry records may be expired safely.
        var charges = await db.SchoolActivityExecutions.AsNoTracking()
            .Where(r => r.CharacterId == characterId && r.CreatedAt >= start && r.CreatedAt < end)
            .Select(r => new { r.ActivityId, r.TimeCost })
            .ToListAsync(ct);
        return CalculateCharges(charges.Select(r => (r.ActivityId, r.TimeCost)), now);
    }

    public static void MapSchoolTimeEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/school/time", GetTime).RequireAuthorization();
    }

    private static async Task<IResult> GetTime(
        ClaimsPrincipal principal, GameDbContext db, CancellationToken ct)
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
    }
}
