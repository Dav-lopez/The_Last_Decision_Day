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
app.MapGet("/api/v1/health/ready", async (GameDbContext db, CancellationToken ct) =>
{
    try
    {
        if (!await db.Database.CanConnectAsync(ct)) return Results.StatusCode(503);
        var applied = (await db.Database.GetAppliedMigrationsAsync(ct)).ToList();
        var pending = (await db.Database.GetPendingMigrationsAsync(ct)).ToList();
        if (applied.Count == 0 || pending.Count != 0) return Results.StatusCode(503);
        return Results.Ok(new { status = "ready", migrations = applied.Count });
    }
    catch (Exception)
    {
        return Results.StatusCode(503);
    }
});
app.MapHub<WorldHub>("/hubs/world");
app.Run();
