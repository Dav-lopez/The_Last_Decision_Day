using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Authentication;
using TheLastDecision.Api.Characters;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using TheLastDecision.Api.Identity;
using Microsoft.EntityFrameworkCore;
using TheLastDecision.Api;
using TheLastDecision.Api.School;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("GameDb");
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("ConnectionStrings:GameDb must be configured.");

// Keep authentication/antiforgery key material stable across VM restarts.
// The configured directory must be writable only by the API service account.
var keyDirectory = builder.Configuration["DataProtection:KeysDirectory"];
if (!string.IsNullOrWhiteSpace(keyDirectory))
{
    Directory.CreateDirectory(keyDirectory);
    builder.Services.AddDataProtection()
        .SetApplicationName("TheLastDecision")
        .PersistKeysToFileSystem(new DirectoryInfo(keyDirectory));
}

builder.Services.AddDbContext<GameDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddScoped<AttributeService>();
builder.Services.AddSignalR();
builder.Services.AddAuthentication("GameCookie").AddCookie("GameCookie", options =>
{
    options.Cookie.Name = "__Host-tld-session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.Path = "/";
    options.LoginPath = "/api/v1/auth/login";
    options.Events.OnValidatePrincipal = async context =>
    {
        var id = context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(id, out var userId))
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync("GameCookie");
            return;
        }
        var db = context.HttpContext.RequestServices.GetRequiredService<GameDbContext>();
        var enabled = await db.Users.AsNoTracking()
            .AnyAsync(user => user.Id == userId && !user.IsDisabled);
        if (!enabled)
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync("GameCookie");
        }
    };
    options.Events.OnRedirectToLogin = ctx =>
    {
        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = ctx =>
    {
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    };
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
});
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "__Host-tld-csrf";
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.HttpOnly = true;
    options.Cookie.Path = "/";
});
builder.Services.AddScoped<IPasswordHasher<GameUser>, PasswordHasher<GameUser>>();

var app = builder.Build();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();
app.MapIdentityEndpoints();
app.MapCharacterEndpoints();
app.MapSchoolPreviewEndpoints();
app.MapGet("/api/v1/health/live", () => Results.Ok(new { status = "alive" }));
app.MapGet("/api/v1/health/ready", async (GameDbContext db, ILogger<Program> logger, CancellationToken ct) =>
{
    try
    {
        if (!await db.Database.CanConnectAsync(ct))
            return Results.Json(new { status = "unavailable", database = "disconnected", schema = "unknown" }, statusCode: 503);
    }
    catch (Exception exception)
    {
        logger.LogError(exception, "Database connectivity check failed");
        return Results.Json(new { status = "unavailable", database = "error", schema = "unknown" }, statusCode: 503);
    }

    try
    {
        var applied = (await db.Database.GetAppliedMigrationsAsync(ct)).ToList();
        var pending = (await db.Database.GetPendingMigrationsAsync(ct)).ToList();
        if (applied.Count == 0)
            return Results.Json(new { status = "unavailable", database = "connected", schema = "not_initialized", appliedMigrations = 0 }, statusCode: 503);
        if (pending.Count > 0)
            return Results.Json(new { status = "unavailable", database = "connected", schema = "pending_migrations", appliedMigrations = applied.Count, pendingMigrations = pending.Count }, statusCode: 503);
        return Results.Ok(new { status = "ready", database = "connected", schema = "ready", appliedMigrations = applied.Count });
    }
    catch (Exception exception)
    {
        logger.LogError(exception, "Schema readiness check failed");
        return Results.Json(new { status = "unavailable", database = "connected", schema = "error" }, statusCode: 503);
    }
});
app.MapGet("/api/v1/school/activities", () => Results.Ok(SchoolActivities.Catalog));
app.MapHub<WorldHub>("/hubs/world");
app.Run();
