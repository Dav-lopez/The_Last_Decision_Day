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

builder.Services.AddDbContext<GameDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddSignalR();
builder.Services.AddAuthentication("GameCookie").AddCookie("GameCookie", options =>
{
    options.Cookie.Name = "__Host-tld-session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.Path = "/";
    options.LoginPath = "/api/v1/auth/login";
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
builder.Services.AddAntiforgery(options => options.HeaderName = "X-CSRF-TOKEN");
builder.Services.AddScoped<IPasswordHasher<GameUser>, PasswordHasher<GameUser>>();

var app = builder.Build();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();
app.MapIdentityEndpoints();
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
