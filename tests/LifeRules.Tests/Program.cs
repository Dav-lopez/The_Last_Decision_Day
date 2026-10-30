using TheLastDecision.Api.Characters;

static void Check(bool condition, string description)
{
    if (!condition) throw new Exception("FAIL: " + description);
    Console.WriteLine("PASS: " + description);
}

var morning = new LifeState(3, 7 * 60, 100, "home");
var minute = TimeSpan.FromSeconds(60);

Check(LifeRules.NewLife == new LifeState(1, 420, 100, "street"), "New life starts on day 1 at 7:00 on the street");
Check(LifeRules.Validate(morning, null, TimeSpan.Zero) == LifeSaveVerdict.Accepted, "First save is accepted");

foreach (var bad in new LifeState?[]
{
    null,
    morning with { Day = 0 },
    morning with { Day = LifeRules.MaxDay + 1 },
    morning with { Minute = -1 },
    morning with { Minute = 1440 },
    morning with { Energy = -1 },
    morning with { Energy = 101 },
    morning with { Location = "school" },
    morning with { Location = null! },
})
    Check(LifeRules.Validate(bad, null, TimeSpan.Zero) == LifeSaveVerdict.Invalid, $"Rejects invalid state {bad}");

var later = morning with { Minute = 7 * 60 + 60, Energy = 94, Location = "street" };
Check(LifeRules.Validate(later, morning, minute) == LifeSaveVerdict.Accepted, "An hour of play after a minute of real time fits the sleep allowance");
Check(LifeRules.Validate(later, morning, TimeSpan.FromMinutes(61)) == LifeSaveVerdict.Accepted, "Normal play is accepted");
Check(LifeRules.Validate(morning, later, minute) == LifeSaveVerdict.Stale, "An older save cannot rewind the day");
Check(LifeRules.Validate(morning, morning, TimeSpan.Zero) == LifeSaveVerdict.Accepted, "Saving the same moment twice is fine");

var evening = new LifeState(3, 23 * 60, 10, "home");
var nextMorning = new LifeState(4, 7 * 60, 100, "home");
Check(LifeRules.Validate(nextMorning, evening, TimeSpan.FromSeconds(5)) == LifeSaveVerdict.Accepted, "Sleeping through the night skips 8 hours and restores energy");

var twoDaysLater = new LifeState(5, 7 * 60, 100, "home");
Check(LifeRules.Validate(twoDaysLater, evening, TimeSpan.FromSeconds(5)) == LifeSaveVerdict.TooFarAhead, "Cannot skip days without the real time passing");
Check(LifeRules.Validate(twoDaysLater, evening, TimeSpan.FromHours(1)) == LifeSaveVerdict.Accepted, "Real play time plus one night allows a longer advance");

var tired = new LifeState(3, 15 * 60, 20, "street");
Check(LifeRules.Validate(tired with { Minute = 15 * 60 + 10, Energy = 90 }, tired, TimeSpan.FromMinutes(10)) == LifeSaveVerdict.EnergyTooHigh,
    "Energy cannot jump up without sleeping");
Check(LifeRules.Validate(tired with { Minute = 15 * 60 + 25, Energy = 38 }, tired, TimeSpan.FromSeconds(30)) == LifeSaveVerdict.Accepted,
    "A cooked meal (+18 energy in 25 minutes) is accepted");
Check(LifeRules.Validate(tired with { Minute = 15 * 60 + 25, Energy = 60 }, tired, TimeSpan.FromSeconds(30)) == LifeSaveVerdict.EnergyTooHigh,
    "Two meals' worth of energy at once is not");
Check(LifeRules.Validate(tired with { Minute = 15 * 60 + 10, Energy = 19 }, tired, TimeSpan.FromMinutes(10)) == LifeSaveVerdict.Accepted,
    "Energy draining while awake is accepted");
Check(LifeRules.TotalMinutes(new LifeState(2, 0, 50, "street")) == 1440, "Total minutes count whole days");
Console.WriteLine("All life rules passed.");
