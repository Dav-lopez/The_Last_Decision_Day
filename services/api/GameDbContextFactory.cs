using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace TheLastDecision.Api;
public sealed class GameDbContextFactory : IDesignTimeDbContextFactory<GameDbContext>
{
    public GameDbContext CreateDbContext(string[] args) {
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__GameDb") ?? "Host=localhost;Port=5432;Database=thelastdecision;Username=tld;Password=change-this-local-password";
        return new GameDbContext(new DbContextOptionsBuilder<GameDbContext>().UseNpgsql(connection).Options);
    }
}
