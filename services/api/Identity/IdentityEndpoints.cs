using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace TheLastDecision.Api.Identity;

public sealed record RegisterRequest(string Email, string Password, DateOnly DateOfBirth, string InviteToken);
public sealed record LoginRequest(string Email, string Password);
public sealed record AuthResult(Guid UserId, string Email);

public static class IdentityEndpoints
{
    public static void MapIdentityEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/auth");
        group.MapGet("/csrf", (Microsoft.AspNetCore.Antiforgery.IAntiforgery antiforgery, HttpContext context) =>
        {
            var tokens = antiforgery.GetAndStoreTokens(context);
            return Results.Ok(new { token = tokens.RequestToken });
        });
        group.MapPost("/register", Register).RequireAntiforgery();
        group.MapPost("/login", Login).RequireAntiforgery();
        group.MapPost("/logout", Logout).RequireAuthorization().RequireAntiforgery();
        group.MapGet("/me", (ClaimsPrincipal principal) =>
        {
            var id = principal.FindFirstValue(ClaimTypes.NameIdentifier);
            return Guid.TryParse(id, out var userId)
                ? Results.Ok(new { userId, email = principal.FindFirstValue(ClaimTypes.Email) })
                : Results.Unauthorized();
        }).RequireAuthorization();
    }

    private static async Task<IResult> Register(RegisterRequest request, GameDbContext db,
        IPasswordHasher<GameUser> hasher, HttpContext context, CancellationToken ct)
    {
        if (!AdultEligibility.IsAtLeast18(request.DateOfBirth, DateOnly.FromDateTime(DateTime.UtcNow)))
            return Results.BadRequest(new { error = "Not eligible for registration." });
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 12 || request.Password.Length > 256 ||
            string.IsNullOrWhiteSpace(request.InviteToken) || request.InviteToken.Length > 512)
            return Results.BadRequest(new { error = "Invalid registration details." });

        string email;
        try { email = AdultEligibility.NormalizeEmail(request.Email); }
        catch (ArgumentException) { return Results.BadRequest(new { error = "Invalid registration details." }); }

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(request.InviteToken)));
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var invite = await db.Invites.FirstOrDefaultAsync(x => x.TokenHash == tokenHash, ct);
        if (invite is null || invite.RedeemedAt is not null || invite.ExpiresAt <= DateTimeOffset.UtcNow)
            return Results.BadRequest(new { error = "Invalid or expired invitation." });
        if (await db.Users.AnyAsync(x => x.EmailNormalized == email, ct))
            return Results.Conflict(new { error = "Account already exists." });

        var user = new GameUser { EmailNormalized = email, DateOfBirth = request.DateOfBirth };
        user.PasswordHash = hasher.HashPassword(user, request.Password);
        db.Users.Add(user);
        invite.RedeemedAt = DateTimeOffset.UtcNow;
        invite.RedeemedByUserId = user.Id;
        try
        {
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Results.Conflict(new { error = "Registration could not be completed." });
        }
        await SignIn(context, user);
        return Results.Created("/api/v1/auth/me", new AuthResult(user.Id, user.EmailNormalized));
    }

    private static async Task<IResult> Login(LoginRequest request, GameDbContext db,
        IPasswordHasher<GameUser> hasher, HttpContext context, CancellationToken ct)
    {
        string email;
        try { email = AdultEligibility.NormalizeEmail(request.Email); }
        catch (ArgumentException) { return Results.Unauthorized(); }
        if (string.IsNullOrEmpty(request.Password)) return Results.Unauthorized();
        var user = await db.Users.FirstOrDefaultAsync(x => x.EmailNormalized == email, ct);
        if (user is null || user.IsDisabled ||
            hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
            return Results.Unauthorized();
        await SignIn(context, user);
        return Results.Ok(new AuthResult(user.Id, user.EmailNormalized));
    }

    private static async Task<IResult> Logout(HttpContext context)
    {
        await context.SignOutAsync("GameCookie");
        return Results.NoContent();
    }

    private static async Task SignIn(HttpContext context, GameUser user)
    {
        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.EmailNormalized)
        ], "GameCookie");
        await context.SignInAsync("GameCookie", new ClaimsPrincipal(identity));
    }
}
