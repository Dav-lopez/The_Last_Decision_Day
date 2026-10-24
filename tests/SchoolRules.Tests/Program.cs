using TheLastDecision.Api.School;

static void Check(bool condition, string description)
{
    if (!condition) throw new Exception("FAIL: " + description);
    Console.WriteLine("PASS: " + description);
}

var initial = new Dictionary<string, int>
{
    ["Intelligence"] = 99,
    ["Discipline"] = 99,
    ["Stress"] = 99,
    ["Reputation"] = 99
};
var study = SchoolActivities.Preview("study", initial);
Check(study.After["Intelligence"] == 100, "Intelligence capped at 100");
Check(study.After["Discipline"] == 100, "Discipline capped at 100");
Check(study.After["Stress"] == 100, "Stress capped at 100");
Check(initial["Intelligence"] == 99, "Preview does not mutate source");
var rest = SchoolActivities.Preview("rest", new Dictionary<string, int>
{
    ["Intelligence"] = 50, ["Discipline"] = 50, ["Stress"] = 2, ["Reputation"] = 50
});
Check(rest.After["Stress"] == 0, "Rest cannot reduce stress below zero");
Check(SchoolActivities.Catalog.Count == 4, "Four starter activities available");
try
{
    SchoolActivities.Preview("unknown", initial);
    throw new Exception("FAIL: Unknown activity was accepted");
}
catch (ArgumentException) { Console.WriteLine("PASS: Unknown activity rejected"); }
try
{
    SchoolActivities.Preview("study", new Dictionary<string, int>());
    throw new Exception("FAIL: Missing attributes were accepted");
}
catch (ArgumentException) { Console.WriteLine("PASS: Missing attributes rejected"); }

var historyCorrelation = Guid.NewGuid();
var completedAt = new DateTimeOffset(2026, 10, 23, 20, 0, 0, TimeSpan.Zero);
var persisted = new TheLastDecision.Api.IdempotencyRecord
{
    Scope = "school:" + Guid.NewGuid().ToString("N"),
    Key = Guid.NewGuid().ToString("N"),
    CorrelationId = historyCorrelation,
    CreatedAt = completedAt,
    ResponseJson = System.Text.Json.JsonSerializer.Serialize(
        new SchoolExecutionResult("study", 2,
            new Dictionary<string, int> { ["Intelligence"] = 25 },
            new Dictionary<string, int> { ["Intelligence"] = 30 },
            historyCorrelation),
        new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))
};
var parsed = SchoolHistoryEndpoints.Parse(persisted);
Check(parsed is not null && parsed.ActivityId == "study" && parsed.TimeCost == 2,
    "Completed school activity is recoverable from persisted response");
Check(parsed is not null && parsed.Before["Intelligence"] == 25 &&
    parsed.After["Intelligence"] == 30 && parsed.CompletedAt == completedAt,
    "School history preserves attribute changes and completion time");
persisted.CorrelationId = Guid.NewGuid();
Check(SchoolHistoryEndpoints.Parse(persisted) is null,
    "History rejects a mismatched persisted correlation ID");
persisted.ResponseJson = "{not valid json";
Check(SchoolHistoryEndpoints.Parse(persisted) is null,
    "History safely rejects malformed persisted responses");

// Durable snapshots are independent of retry records and current catalog entries.
var durable = new TheLastDecision.Api.SchoolActivityExecution
{
    CharacterId = Guid.NewGuid(),
    ActivityId = "retired-activity",
    TimeCost = 3,
    CorrelationId = Guid.NewGuid(),
    CreatedAt = completedAt,
    BeforeJson = System.Text.Json.JsonSerializer.Serialize(
        new Dictionary<string, int> { ["Intelligence"] = 25 }),
    AfterJson = System.Text.Json.JsonSerializer.Serialize(
        new Dictionary<string, int> { ["Intelligence"] = 30 })
};
var durableHistory = SchoolHistoryEndpoints.Parse(durable);
Check(durableHistory is not null && durableHistory.ActivityId == "retired-activity" &&
    durableHistory.TimeCost == 3 && durableHistory.After["Intelligence"] == 30,
    "Durable history preserves charged cost and attributes for retired activities");
durable.BeforeJson = "{broken";
Check(SchoolHistoryEndpoints.Parse(durable) is null,
    "Durable history rejects malformed attribute snapshots");

// Daily budget is deterministic, UTC-based, and derived from committed actions.
var utcNow = new DateTimeOffset(2026, 10, 23, 23, 59, 0, TimeSpan.Zero);
var emptyBudget = SchoolTimeBudget.Calculate([], utcNow);
Check(emptyBudget.DailyLimit == 8 && emptyBudget.Spent == 0 && emptyBudget.Remaining == 8,
    "New UTC day starts with eight time units");
Check(emptyBudget.ResetsAt == new DateTimeOffset(2026, 10, 24, 0, 0, 0, TimeSpan.Zero),
    "School budget resets at midnight UTC");
var schoolHistory = new List<SchoolActivityHistoryEntry>();
for (var i = 0; i < 4; i++)
    schoolHistory.Add(new SchoolActivityHistoryEntry("study", 2,
        new Dictionary<string, int>(), new Dictionary<string, int>(), Guid.NewGuid(), utcNow));
var exhausted = SchoolTimeBudget.Calculate(schoolHistory, utcNow);
Check(exhausted.Spent == 8 && exhausted.Remaining == 0,
    "Four study activities exhaust the daily budget");
Check(!SchoolTimeBudget.CanExecute(exhausted, SchoolActivities.Catalog[0]),
    "Exhausted budget rejects further study");
var partiallyUsed = SchoolTimeBudget.Calculate(schoolHistory.Take(3), utcNow);
Check(SchoolTimeBudget.CanExecute(partiallyUsed, SchoolActivities.Catalog[0]),
    "Two-unit activity fits exact remaining budget");
var sevenSpent = SchoolTimeBudget.Calculate(schoolHistory.Take(3).Concat(
    [new SchoolActivityHistoryEntry("rest", 1,
        new Dictionary<string, int>(), new Dictionary<string, int>(), Guid.NewGuid(), utcNow)]), utcNow);
Check(sevenSpent.Remaining == 1 && !SchoolTimeBudget.CanExecute(sevenSpent, SchoolActivities.Catalog[0]) &&
    SchoolTimeBudget.CanExecute(sevenSpent, SchoolActivities.Catalog[3]),
    "One remaining unit permits rest but rejects study");
var historicalCost = SchoolTimeBudget.Calculate([
    new SchoolActivityHistoryEntry("study", 3, new Dictionary<string, int>(),
        new Dictionary<string, int>(), Guid.NewGuid(), utcNow),
    new SchoolActivityHistoryEntry("retired-activity", 1, new Dictionary<string, int>(),
        new Dictionary<string, int>(), Guid.NewGuid(), utcNow)
], utcNow);
Check(historicalCost.Spent == 4 && historicalCost.Remaining == 4,
    "Historical costs and retired activities remain valid after catalog changes");
Check(SchoolTimeBudget.StartOfUtcDay(new DateTimeOffset(2026, 10, 23, 18, 0, 0, TimeSpan.FromHours(-5))) ==
    new DateTimeOffset(2026, 10, 23, 0, 0, 0, TimeSpan.Zero),
    "UTC day boundaries are independent of client time zone");
try
{
    SchoolTimeBudget.Calculate([new SchoolActivityHistoryEntry("study", 0,
        new Dictionary<string, int>(), new Dictionary<string, int>(), Guid.NewGuid(), utcNow)], utcNow);
    throw new Exception("FAIL: Corrupt school time was accepted");
}
catch (InvalidDataException) { Console.WriteLine("PASS: Corrupt school time fails closed"); }

