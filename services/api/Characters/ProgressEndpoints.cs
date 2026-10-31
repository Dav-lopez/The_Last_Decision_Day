using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace TheLastDecision.Api.Characters;

public sealed record ProgressResponse(long SavedAt, JsonElement? Data, bool Saved);

/// <summary>Story, career and relationship progress for the signed-in player's character (newest save wins).</summary>
public static class ProgressEndpoints
{
    public static void MapProgressEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/characters/me/progress").RequireAuthorization();
        group.MapGet("", GetProgress);
        group.MapPut("", SaveProgress).AddEndpointFilter(global::TheLastDecision.Api.Identity.IdentityEndpoints.ValidateCsrf);
    }

    private static ProgressResponse Response(CharacterProgress row)
    {
        using var document = JsonDocument.Parse(row.DataJson);
        return new ProgressResponse(row.SavedAt, document.RootElement.Clone(), true);
    }

    /// <summary>Nothing saved yet: the browser keeps (and uploads) its own copy.</summary>
    private static async Task<IResult> GetProgress(ClaimsPrincipal principal, GameDbContext db, CancellationToken ct)
    {
        var characterId = await CharacterId(principal, db, ct);
        if (characterId is null) return Results.NotFound();
        var row = await db.CharacterProgress.AsNoTracking().SingleOrDefaultAsync(x => x.CharacterId == characterId, ct);
        return Results.Ok(row is null ? new ProgressResponse(0, null, false) : Response(row));
    }

    private static async Task<IResult> SaveProgress(ProgressSave request, ClaimsPrincipal principal, GameDbContext db, CancellationToken ct)
    {
        var characterId = await CharacterId(principal, db, ct);
        if (characterId is null) return Results.NotFound();
        var row = await db.CharacterProgress.SingleOrDefaultAsync(x => x.CharacterId == characterId, ct);
        var now = DateTimeOffset.UtcNow;
        switch (ProgressRules.Validate(request, row?.SavedAt, now))
        {
            case ProgressSaveVerdict.Invalid:
                return Results.BadRequest(new { error = "That progress save is not valid." });
            case ProgressSaveVerdict.Stale:
                // The client adopts the newer copy returned here.
                return Results.Conflict(new { error = "Newer progress is already saved.", current = Response(row!) });
        }

        if (row is null)
        {
            row = new CharacterProgress { CharacterId = characterId.Value };
            db.CharacterProgress.Add(row);
        }
        row.SavedAt = request.SavedAt;
        row.DataJson = request.Data.GetRawText();
        row.UpdatedAt = now;
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Two first saves raced on the unique CharacterId index; the client retries.
            return Results.Conflict(new { error = "Your progress was saved from another session. Please retry." });
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
