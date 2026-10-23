using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using TheLastDecision.Api.School;

namespace TheLastDecision.Api.School;

public static class SchoolPreviewEndpoints
{
    public static void MapSchoolPreviewEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/school/activities/{activityId}/preview", Preview).RequireAuthorization();
    }

    private static async Task<IResult> Preview(string activityId, ClaimsPrincipal principal,
        GameDbContext db, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return Results.Unauthorized();
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == userId, ct);
        if (user is null || user.IsDisabled) return Results.Forbid();
        var character = await db.Characters.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId, ct);
        if (character is null) return Results.NotFound(new { error = "Create a character first." });
        var attributes = await db.CharacterAttributes.AsNoTracking()
            .Where(x => x.CharacterId == character.Id)
            .ToDictionaryAsync(x => x.Name, x => x.Value, ct);
        try { return Results.Ok(SchoolActivities.Preview(activityId, attributes)); }
        catch (ArgumentException) { return Results.BadRequest(new { error = "Unknown activity or invalid character attributes." }); }
    }
}
