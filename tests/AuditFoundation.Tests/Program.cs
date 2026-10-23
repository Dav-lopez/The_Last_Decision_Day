using Microsoft.EntityFrameworkCore;
using TheLastDecision.Api;
using TheLastDecision.Api.Characters;

static void Check(bool ok, string name)
{
    if (!ok) throw new Exception("FAIL: " + name);
    Console.WriteLine("PASS: " + name);
}

// No database connection required: verify EF model and tracked atomic writes.
var options = new DbContextOptionsBuilder<GameDbContext>()
    .UseNpgsql("Host=localhost;Database=audit_model_test;Username=unused;Password=unused")
    .Options;
using var db = new GameDbContext(options);
var characterId = Guid.NewGuid();
var correlationId = Guid.NewGuid();
var service = new AttributeService(db);
var starter = service.Initialize(characterId, correlationId);
var attributes = db.ChangeTracker.Entries<CharacterAttribute>().Select(e => e.Entity).ToList();
var events = db.ChangeTracker.Entries<AttributeEvent>().Select(e => e.Entity).ToList();
Check(attributes.Count == 4, "Four starter attributes staged");
Check(events.Count == 4, "Every starter attribute has an audit event");
Check(events.All(e => e.CharacterId == characterId && e.CorrelationId == correlationId &&
    e.Reason == "character_created" && e.BeforeValue is null), "Creation event metadata is complete");
Check(events.All(e => starter[e.Name] == e.AfterValue), "Audit after-values match starter values");
Check(starter["Intelligence"] == 25 && starter["Discipline"] == 25 &&
    starter["Stress"] == 0 && starter["Reputation"] == 25, "Starter values are centralized");
try
{
    await service.ApplyAsync(characterId, new Dictionary<string, int> { ["Stress"] = 101 },
        "school_activity", Guid.NewGuid(), CancellationToken.None);
    throw new Exception("FAIL: invalid attribute target accepted");
}
catch (ArgumentException) { Console.WriteLine("PASS: invalid attribute target rejected"); }
var txEntity = db.Model.FindEntityType(typeof(WalletTransaction))
    ?? throw new Exception("Missing wallet transaction entity");
Check(txEntity.GetIndexes().Any(index => index.IsUnique &&
    index.Properties.Select(p => p.Name).SequenceEqual(new[] { "WalletId", "IdempotencyKey" })),
    "Wallet idempotency key is unique per wallet");
var idempotencyEntity = db.Model.FindEntityType(typeof(IdempotencyRecord))
    ?? throw new Exception("Missing idempotency record entity");
Check(idempotencyEntity.GetIndexes().Any(index => index.IsUnique &&
    index.Properties.Select(p => p.Name).SequenceEqual(new[] { "Scope", "Key" })),
    "Idempotency record key is unique per scope");
