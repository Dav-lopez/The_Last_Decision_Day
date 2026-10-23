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
