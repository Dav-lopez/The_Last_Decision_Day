using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace TheLastDecision.Api.Characters;

public sealed record CreateCharacterRequest(string DisplayName, int GameAge);
public sealed record CharacterProfile(Guid Id, string DisplayName, int GameAge,
    IReadOnlyDictionary<string, int> Attributes, long Coins);

public static class CharacterEndpoints
{
    private static readonly string[] AttributeNames = ["Intelligence", "Discipline", "Stress", "Reputation"];

    public static void MapCharacterEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/characters").RequireAuthorization();
        group.MapGet("/me", GetMine);
        group.MapPost("", Create).RequireAntiforgery();
    }

    private static async Task<IResult> GetMine(ClaimsPrincipal principal, GameDbContext db, CancellationToken ct)
    {
        if (!TryUserId(principal, out var userId)) return Results.Unauthorized();
        var character = await db.Characters.AsNoTracking().SingleOrDefaultAsync(c => c.UserId == userId, ct);
        if (character is null) return Results.NotFound();
        return Results.Ok(await Profile(db, character, ct));
    }

    private static async Task<IResult> Create(CreateCharacterRequest request, ClaimsPrincipal principal,
        GameDbContext db, CancellationToken ct)
    {
        if (!TryUserId(principal, out var userId)) return Results.Unauthorized();
        var name = request.DisplayName?.Trim() ?? "";
        if (name.Length is < 2 or > 32 || name.Any(char.IsControl) || request.GameAge is < 18 or > 100)
            return Results.BadRequest(new { error = "Invalid character details." });

        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null || user.IsDisabled) return Results.Forbid();
        if (await db.Characters.AnyAsync(c => c.UserId == userId, ct))
            return Results.Conflict(new { error = "A character already exists." });

        var character = new Character { UserId = userId, DisplayName = name, GameAge = request.GameAge };
        db.Characters.Add(character);
        var initial = new Dictionary<string, int>
        {
            ["Intelligence"] = 25, ["Discipline"] = 25, ["Stress"] = 0, ["Reputation"] = 25
        };
        foreach (var attribute in initial)
            db.CharacterAttributes.Add(new CharacterAttribute
            {
                CharacterId = character.Id, Name = attribute.Key, Value = attribute.Value
            });
        db.Wallets.Add(new Wallet { CharacterId = character.Id, Currency = "COIN", Balance = 0 });

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Results.Conflict(new { error = "Unable to create character." });
        }
        return Results.Created("/api/v1/characters/me",
            new CharacterProfile(character.Id, character.DisplayName, character.GameAge, initial, 0));
    }

    private static async Task<CharacterProfile> Profile(GameDbContext db, Character character, CancellationToken ct)
    {
        var attributes = await db.CharacterAttributes.AsNoTracking()
            .Where(a => a.CharacterId == character.Id)
            .ToDictionaryAsync(a => a.Name, a => a.Value, ct);
        var wallet = await db.Wallets.AsNoTracking().SingleOrDefaultAsync(w => w.CharacterId == character.Id, ct);
        return new CharacterProfile(character.Id, character.DisplayName, character.GameAge,
            attributes, wallet?.Balance ?? 0);
    }

    private static bool TryUserId(ClaimsPrincipal principal, out Guid userId) =>
        Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out userId);
}
