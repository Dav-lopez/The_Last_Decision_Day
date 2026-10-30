using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace TheLastDecision.Api.Characters;

public sealed record LifeResponse(int Day, int Minute, int Energy, string Location, bool Saved);

public static class LifeEndpoints
{
    public static void MapLifeEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/characters/me/life").RequireAuthorization();
        group.MapGet("", GetLife);
        group.MapPut("", SaveLife).AddEndpointFilter(global::TheLastDecision.Api.Identity.IdentityEndpoints.ValidateCsrf);
    }

    private static LifeResponse Response(CharacterLife row) => new(row.Day, row.Minute, row.Energy, row.Location, true);
    private static LifeState State(CharacterLife row) => new(row.Day, row.Minute, row.Energy, row.Location);

    /// <summary>A character with no saved day yet starts on day 1 at 7:00 AM on the street.</summary>
    private static async Task<IResult> GetLife(ClaimsPrincipal principal, GameDbContext db, CancellationToken ct)
    {
        var characterId = await CharacterId(principal, db, ct);
        if (characterId is null) return Results.NotFound();
        var row = await db.CharacterLives.AsNoTracking().SingleOrDefaultAsync(x => x.CharacterId == characterId, ct);
        var life = LifeRules.NewLife;
        return Results.Ok(row is null ? new LifeResponse(life.Day, life.Minute, life.Energy, life.Location, false) : Response(row));
    }

    private static async Task<IResult> SaveLife(LifeState request, ClaimsPrincipal principal, GameDbContext db, CancellationToken ct)
    {
        var characterId = await CharacterId(principal, db, ct);
        if (characterId is null) return Results.NotFound();
        var row = await db.CharacterLives.SingleOrDefaultAsync(x => x.CharacterId == characterId, ct);
        var now = DateTimeOffset.UtcNow;
        var verdict = LifeRules.Validate(request, row is null ? null : State(row), row is null ? TimeSpan.Zero : now - row.UpdatedAt);
        switch (verdict)
        {
            case LifeSaveVerdict.Invalid:
                return Results.BadRequest(new { error = "Invalid day, time, energy or location." });
            case LifeSaveVerdict.Stale:
                // The client adopts the newer saved day returned here.
                return Results.Conflict(new { error = "A newer day is already saved.", current = Response(row!) });
            case LifeSaveVerdict.TooFarAhead:
            case LifeSaveVerdict.EnergyTooHigh:
                return Results.UnprocessableEntity(new { error = "That save is not possible from the last saved day.", current = Response(row!) });
        }

        if (row is null)
        {
            row = new CharacterLife { CharacterId = characterId.Value };
            db.CharacterLives.Add(row);
        }
        row.Day = request.Day;
        row.Minute = request.Minute;
        row.Energy = request.Energy;
        row.Location = request.Location;
        row.UpdatedAt = now;
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Two first saves raced on the unique CharacterId index; the client retries.
            return Results.Conflict(new { error = "Your day was saved from another session. Please retry." });
        }
        return Results.Ok(Response(row));
    }

    private static async Task<Guid?> CharacterId(ClaimsPrincipal principal, GameDbContext db, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return null;
        var character = await db.Characters.AsNoTracking().Where(c => c.UserId == userId)
            .Select(c => new { c.Id }).SingleOrDefaultAsync(ct);
        return character?.Id;
    }
}
