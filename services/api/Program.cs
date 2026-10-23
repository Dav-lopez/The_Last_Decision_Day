using Microsoft.EntityFrameworkCore;
using TheLastDecision.Api;
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<GameDbContext>(o => o.UseNpgsql(builder.Configuration.GetConnectionString("GameDb")));
builder.Services.AddSignalR();
var app = builder.Build();
app.MapGet("/api/v1/health/live", () => Results.Ok(new { status = "alive" }));
app.MapGet("/api/v1/health/ready", async (GameDbContext db) => {
    try {
        if (!await db.Database.CanConnectAsync()) return Results.StatusCode(503);
        var applied = (await db.Database.GetAppliedMigrationsAsync()).ToList();
        var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
        return applied.Count > 0 && pending.Count == 0 ? Results.Ok(new { status = "ready", migrations = applied.Count }) : Results.StatusCode(503);
    } catch { return Results.StatusCode(503); }
});
app.MapHub<WorldHub>("/hubs/world");
app.Run();
