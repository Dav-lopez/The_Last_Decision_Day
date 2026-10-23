using Microsoft.EntityFrameworkCore;
using TheLastDecision.Api;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("GameDb");
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("ConnectionStrings:GameDb must be configured.");

builder.Services.AddDbContext<GameDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddSignalR();

var app = builder.Build();
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
app.MapHub<WorldHub>("/hubs/world");
app.Run();
