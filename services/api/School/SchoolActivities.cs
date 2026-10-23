namespace TheLastDecision.Api.School;

public sealed record AttributeChange(string Attribute, int Delta);
public sealed record SchoolActivity(string Id, string Title, string Description, int TimeCost, IReadOnlyList<AttributeChange> Changes);
public sealed record ActivityPreview(string ActivityId, int TimeCost, IReadOnlyDictionary<string, int> Before, IReadOnlyDictionary<string, int> After);

/// <summary>Pure, deterministic school rules. Preview never writes to the database.</summary>
public static class SchoolActivities
{
    public static readonly IReadOnlyList<SchoolActivity> Catalog =
    [
        new("study", "Study in the library", "Prepare for the next lesson.", 2,
            [new("Intelligence", 4), new("Discipline", 2), new("Stress", 3)]),
        new("attend-class", "Attend class", "Learn with classmates and teachers.", 1,
            [new("Intelligence", 2), new("Discipline", 2), new("Stress", 1)]),
        new("help-classmate", "Help a classmate", "Give someone a hand with their work.", 1,
            [new("Reputation", 4), new("Stress", 1)]),
        new("rest", "Take a break", "Recover from the demands of the school day.", 1,
            [new("Stress", -5)])
    ];

    public static ActivityPreview Preview(string activityId, IReadOnlyDictionary<string, int> current)
    {
        ArgumentNullException.ThrowIfNull(current);
        var activity = Catalog.FirstOrDefault(x => x.Id == activityId)
            ?? throw new ArgumentException("Unknown school activity.", nameof(activityId));
        string[] names = ["Intelligence", "Discipline", "Stress", "Reputation"];
        var before = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var name in names)
        {
            if (!current.TryGetValue(name, out var value) || value is < 0 or > 100)
                throw new ArgumentException($"Invalid or missing attribute: {name}.", nameof(current));
            before[name] = value;
        }
        var after = new Dictionary<string, int>(before, StringComparer.Ordinal);
        foreach (var change in activity.Changes)
            after[change.Attribute] = Math.Clamp(after[change.Attribute] + change.Delta, 0, 100);
        return new ActivityPreview(activity.Id, activity.TimeCost, before, after);
    }
}
