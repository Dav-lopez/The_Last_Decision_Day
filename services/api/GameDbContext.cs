using Microsoft.EntityFrameworkCore;
namespace TheLastDecision.Api;
public sealed class GameDbContext(DbContextOptions<GameDbContext> options) : DbContext(options)
{
    public DbSet<Character> Characters => Set<Character>();
    public DbSet<CharacterAttribute> CharacterAttributes => Set<CharacterAttribute>();
    public DbSet<Wallet> Wallets => Set<Wallet>();
    public DbSet<WalletTransaction> WalletTransactions => Set<WalletTransaction>();
    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Character>().HasIndex(x => x.UserId).IsUnique();
        b.Entity<CharacterAttribute>().HasIndex(x => new { x.CharacterId, x.Name }).IsUnique();
        b.Entity<CharacterAttribute>().ToTable(t => t.HasCheckConstraint("CK_Attribute_Range", "\"Value\" >= 0 AND \"Value\" <= 100"));
        b.Entity<Wallet>().HasIndex(x => x.CharacterId).IsUnique();
        b.Entity<WalletTransaction>().HasOne<Wallet>().WithMany().HasForeignKey(x => x.WalletId);
        b.Entity<WalletTransaction>().HasIndex(x => x.IdempotencyKey).IsUnique();
    }
}
public sealed class Character { public Guid Id {get;set;} = Guid.NewGuid(); public Guid UserId {get;set;} public string DisplayName {get;set;} = ""; public int GameAge {get;set;} = 18; }
public sealed class CharacterAttribute { public Guid Id {get;set;} = Guid.NewGuid(); public Guid CharacterId {get;set;} public string Name {get;set;} = ""; public int Value {get;set;} }
public sealed class Wallet { public Guid Id {get;set;} = Guid.NewGuid(); public Guid CharacterId {get;set;} public string Currency {get;set;} = "COIN"; public long Balance {get;set;} }
public sealed class WalletTransaction { public Guid Id {get;set;} = Guid.NewGuid(); public Guid WalletId {get;set;} public long Delta {get;set;} public string IdempotencyKey {get;set;} = ""; public DateTimeOffset CreatedAt {get;set;} = DateTimeOffset.UtcNow; }
