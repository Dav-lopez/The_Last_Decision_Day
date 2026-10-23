using TheLastDecision.Api.Identity;
using Microsoft.EntityFrameworkCore;

namespace TheLastDecision.Api;

public sealed class GameDbContext(DbContextOptions<GameDbContext> options) : DbContext(options)
{
    public DbSet<GameUser> Users => Set<GameUser>();
    public DbSet<GameInvite> Invites => Set<GameInvite>();
    public DbSet<Character> Characters => Set<Character>();
    public DbSet<CharacterAttribute> CharacterAttributes => Set<CharacterAttribute>();
    public DbSet<Wallet> Wallets => Set<Wallet>();
    public DbSet<WalletTransaction> WalletTransactions => Set<WalletTransaction>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<GameUser>().HasIndex(x => x.EmailNormalized).IsUnique();
        b.Entity<GameUser>().Property(x => x.EmailNormalized).HasMaxLength(254).IsRequired();
        b.Entity<GameUser>().Property(x => x.PasswordHash).IsRequired();
        b.Entity<GameUser>().Property(x => x.DateOfBirth).IsRequired();
        b.Entity<GameInvite>().HasIndex(x => x.TokenHash).IsUnique();
        b.Entity<GameInvite>().Property(x => x.TokenHash).HasMaxLength(128).IsRequired();
        b.Entity<GameInvite>().HasOne<GameUser>().WithMany().HasForeignKey(x => x.RedeemedByUserId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<GameInvite>().HasIndex(x => x.RedeemedByUserId).IsUnique();
        b.Entity<Character>().HasOne<GameUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Character>().HasIndex(x => x.UserId).IsUnique();
        b.Entity<CharacterAttribute>().HasIndex(x => new { x.CharacterId, x.Name }).IsUnique();
        b.Entity<CharacterAttribute>().ToTable(t => t.HasCheckConstraint("CK_Attribute_Range", "\"Value\" >= 0 AND \"Value\" <= 100"));
        b.Entity<CharacterAttribute>().ToTable(t => t.HasCheckConstraint("CK_Attribute_Name", "\"Name\" IN ('Intelligence','Discipline','Stress','Reputation')"));
        b.Entity<CharacterAttribute>().HasOne<Character>().WithMany().HasForeignKey(x => x.CharacterId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Wallet>().HasIndex(x => x.CharacterId).IsUnique();
        b.Entity<Wallet>().HasOne<Character>().WithOne().HasForeignKey<Wallet>(x => x.CharacterId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Wallet>().Property(x => x.Currency).HasMaxLength(4);
        b.Entity<Wallet>().ToTable(t => t.HasCheckConstraint("CK_Wallet_Currency", "\"Currency\" = 'COIN'"));
        b.Entity<WalletTransaction>().HasOne<Wallet>().WithMany().HasForeignKey(x => x.WalletId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<WalletTransaction>().HasIndex(x => x.IdempotencyKey).IsUnique();
        b.Entity<WalletTransaction>().Property(x => x.IdempotencyKey).HasMaxLength(128);
        b.Entity<WalletTransaction>().Property(x => x.CreatedAt).HasDefaultValueSql("now()");
    }
}
public sealed class Character
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string DisplayName { get; set; } = "";
    public int GameAge { get; set; } = 18;
}
public sealed class CharacterAttribute
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CharacterId { get; set; }
    public string Name { get; set; } = "";
    public int Value { get; set; }
}
public sealed class Wallet
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CharacterId { get; set; }
    public string Currency { get; set; } = "COIN";
    public long Balance { get; set; }
}
public sealed class WalletTransaction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WalletId { get; set; }
    public long Delta { get; set; }
    public string IdempotencyKey { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
