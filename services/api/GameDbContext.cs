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
    public DbSet<AttributeEvent> AttributeEvents => Set<AttributeEvent>();
    public DbSet<IdempotencyRecord> IdempotencyRecords => Set<IdempotencyRecord>();
    public DbSet<SchoolActivityExecution> SchoolActivityExecutions => Set<SchoolActivityExecution>();
    public DbSet<CharacterLife> CharacterLives => Set<CharacterLife>();

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
        b.Entity<Character>().Property(x => x.DisplayName).HasMaxLength(32).IsRequired();
        b.Entity<Character>().ToTable(t => t.HasCheckConstraint("CK_Character_DisplayName_Length", "char_length(\"DisplayName\") BETWEEN 2 AND 32"));
        b.Entity<CharacterAttribute>().HasIndex(x => new { x.CharacterId, x.Name }).IsUnique();
        b.Entity<CharacterAttribute>().ToTable(t => t.HasCheckConstraint("CK_Attribute_Range", "\"Value\" >= 0 AND \"Value\" <= 100"));
        b.Entity<CharacterAttribute>().ToTable(t => t.HasCheckConstraint("CK_Attribute_Name", "\"Name\" IN ('Intelligence','Discipline','Stress','Reputation')"));
        b.Entity<CharacterAttribute>().HasOne<Character>().WithMany().HasForeignKey(x => x.CharacterId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Wallet>().HasIndex(x => x.CharacterId).IsUnique();
        b.Entity<Wallet>().HasOne<Character>().WithOne().HasForeignKey<Wallet>(x => x.CharacterId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Wallet>().Property(x => x.Currency).HasMaxLength(4);
        b.Entity<Wallet>().ToTable(t => t.HasCheckConstraint("CK_Wallet_Currency", "\"Currency\" = 'COIN'"));
        b.Entity<Wallet>().ToTable(t => t.HasCheckConstraint("CK_Wallet_Nonnegative_Balance", "\"Balance\" >= 0"));
        b.Entity<WalletTransaction>().HasOne<Wallet>().WithMany().HasForeignKey(x => x.WalletId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<WalletTransaction>().HasIndex(x => new { x.WalletId, x.IdempotencyKey }).IsUnique();
        b.Entity<WalletTransaction>().Property(x => x.IdempotencyKey).HasMaxLength(128);
        b.Entity<WalletTransaction>().Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Entity<WalletTransaction>().Property(x => x.Reason).HasMaxLength(64).IsRequired();
        b.Entity<WalletTransaction>().HasIndex(x => x.CorrelationId);
        b.Entity<AttributeEvent>().HasOne<Character>().WithMany().HasForeignKey(x => x.CharacterId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<AttributeEvent>().HasIndex(x => new { x.CharacterId, x.CreatedAt });
        b.Entity<AttributeEvent>().HasIndex(x => x.CorrelationId);
        b.Entity<AttributeEvent>().Property(x => x.Name).HasMaxLength(32).IsRequired();
        b.Entity<AttributeEvent>().Property(x => x.Reason).HasMaxLength(64).IsRequired();
        b.Entity<AttributeEvent>().Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Entity<AttributeEvent>().ToTable(t => t.HasCheckConstraint("CK_AttributeEvent_After_Range", "\"AfterValue\" BETWEEN 0 AND 100"));
        b.Entity<AttributeEvent>().ToTable(t => t.HasCheckConstraint("CK_AttributeEvent_Before_Range", "\"BeforeValue\" IS NULL OR \"BeforeValue\" BETWEEN 0 AND 100"));
        b.Entity<IdempotencyRecord>().HasIndex(x => new { x.Scope, x.Key }).IsUnique();
        // Scope-prefixed UTC history/time queries; newest records first.
        b.Entity<IdempotencyRecord>().HasIndex(x => new { x.Scope, x.CreatedAt, x.Id })
            .IsDescending(false, true, true);
        b.Entity<IdempotencyRecord>().Property(x => x.Scope).HasMaxLength(64).IsRequired();
        b.Entity<IdempotencyRecord>().Property(x => x.Key).HasMaxLength(128).IsRequired();
        b.Entity<IdempotencyRecord>().Property(x => x.RequestHash).HasMaxLength(128).IsRequired();
        b.Entity<IdempotencyRecord>().Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Entity<SchoolActivityExecution>().HasOne<Character>().WithMany().HasForeignKey(x => x.CharacterId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<SchoolActivityExecution>().HasIndex(x => x.CorrelationId).IsUnique();
        b.Entity<SchoolActivityExecution>().HasIndex(x => new { x.CharacterId, x.CreatedAt, x.Id }).IsDescending(false, true, true);
        b.Entity<SchoolActivityExecution>().Property(x => x.ActivityId).HasMaxLength(64).IsRequired();
        b.Entity<SchoolActivityExecution>().Property(x => x.BeforeJson).IsRequired();
        b.Entity<SchoolActivityExecution>().Property(x => x.AfterJson).IsRequired();
        b.Entity<SchoolActivityExecution>().Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        b.Entity<SchoolActivityExecution>().ToTable(t => t.HasCheckConstraint("CK_SchoolExecution_ValidCharge", "\"TimeCost\" BETWEEN 1 AND 8"));
        b.Entity<SchoolActivityExecution>().ToTable(t => t.HasCheckConstraint("CK_SchoolExecution_ActivityId", "char_length(\"ActivityId\") BETWEEN 1 AND 64"));
        b.Entity<CharacterLife>().HasIndex(x => x.CharacterId).IsUnique();
        b.Entity<CharacterLife>().HasOne<Character>().WithOne().HasForeignKey<CharacterLife>(x => x.CharacterId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<CharacterLife>().Property(x => x.Location).HasMaxLength(16).IsRequired();
        b.Entity<CharacterLife>().ToTable(t => t.HasCheckConstraint("CK_CharacterLife_Day", "\"Day\" >= 1"));
        b.Entity<CharacterLife>().ToTable(t => t.HasCheckConstraint("CK_CharacterLife_Minute", "\"Minute\" BETWEEN 0 AND 1439"));
        b.Entity<CharacterLife>().ToTable(t => t.HasCheckConstraint("CK_CharacterLife_Energy", "\"Energy\" BETWEEN 0 AND 100"));
        b.Entity<CharacterLife>().ToTable(t => t.HasCheckConstraint("CK_CharacterLife_Location", "\"Location\" IN ('street','home')"));
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
    public string Reason { get; set; } = "";
    public Guid CorrelationId { get; set; }
}
public sealed class AttributeEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CharacterId { get; set; }
    public string Name { get; set; } = "";
    public int? BeforeValue { get; set; }
    public int AfterValue { get; set; }
    public string Reason { get; set; } = "";
    public Guid CorrelationId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class IdempotencyRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Scope { get; set; } = "";
    public string Key { get; set; } = "";
    public string RequestHash { get; set; } = "";
    public string? ResponseJson { get; set; }
    public Guid CorrelationId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Durable completed school action; independent of retry-key retention.</summary>
public sealed class SchoolActivityExecution
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CharacterId { get; set; }
    public string ActivityId { get; set; } = "";
    public int TimeCost { get; set; }
    public Guid CorrelationId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string BeforeJson { get; set; } = "";
    public string AfterJson { get; set; } = "";
}

/// <summary>The character's day: game clock, energy and where they are. One row per character.</summary>
public sealed class CharacterLife
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CharacterId { get; set; }
    public int Day { get; set; } = 1;
    public int Minute { get; set; } = 420;
    public int Energy { get; set; } = 100;
    public string Location { get; set; } = "street";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
