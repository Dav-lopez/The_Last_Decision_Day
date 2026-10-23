using Microsoft.EntityFrameworkCore;
using TheLastDecision.Api;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<GameDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("GameDb")));
builder.Services.AddSignalR();

var app = builder.Build();

app.MapGet("/api/v1/health/live", () => Results.Ok(new { status = "alive" }));

app.MapGet("/api/v1/health/ready", async (GameDbContext db, ILogger<Program> logger) =>
{
    try
    {
        if (!await db.Database.CanConnectAsync())
        {
            return Results.Json(
                new { status = "unavailable", database = "disconnected", schema = "unknown" },
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }
    catch (Exception exception)
    {
        logger.LogError(exception, "Database connectivity health check failed");
        return Results.Json(
            new { status = "unavailable", database = "error", schema = "unknown" },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    try
    {
        var applied = (await db.Database.GetAppliedMigrationsAsync()).ToList();
        var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
        if (applied.Count == 0)
        {
            return Results.Json(
                new { status = "unavailable", database = "connected", schema = "not_initialized", appliedMigrations = 0 },
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        if (pending.Count > 0)
        {
            return Results.Json(
                new { status = "unavailable", database = "connected", schema = "pending_migrations", appliedMigrations = applied.Count, pendingMigrations = pending.Count },
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return Results.Ok(new { status = "ready", database = "connected", schema = "ready", appliedMigrations = applied.Count });
    }
    catch (Exception exception)
    {
        logger.LogError(exception, "Schema readiness health check failed");
        return Results.Json(
            new { status = "unavailable", database = "connected", schema = "error" },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.MapHub<WorldHub>("/hubs/world");
app.Run();
