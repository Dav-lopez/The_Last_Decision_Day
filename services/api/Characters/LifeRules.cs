namespace TheLastDecision.Api.Characters;

public sealed record LifeState(int Day, int Minute, int Energy, string Location);

public enum LifeSaveVerdict { Accepted, Invalid, Stale, TooFarAhead, EnergyTooHigh }

/// <summary>
/// Validation for saving a character's day. The browser runs the clock (one real
/// second = one game minute) and saves periodically; the server only accepts a
/// save that is plausible given the real time since the previous one.
/// </summary>
public static class LifeRules
{
    public const int MinutesPerDay = 1440;
    public const int WakeMinute = 7 * 60;
    public const int MaxDay = 100_000;
    /// <summary>Energy recovered per game hour of sleep (8 hours restores 100).</summary>
    public const double EnergyPerHourSlept = 12.5;
    /// <summary>A cooked meal restores 18 energy; allow one meal (with margin) between saves.</summary>
    public const int MealEnergyAllowance = 20;
    /// <summary>One night's sleep (up to a full day) may be skipped in a single save.</summary>
    public const int SleepAllowanceMinutes = MinutesPerDay;
    private const int ClockSlackMinutes = 5;

    public static IReadOnlyList<string> Locations { get; } = ["street", "home"];
    public static LifeState NewLife { get; } = new(1, WakeMinute, 100, "street");

    public static long TotalMinutes(LifeState life) => (long)(life.Day - 1) * MinutesPerDay + life.Minute;

    public static LifeSaveVerdict Validate(LifeState? next, LifeState? stored, TimeSpan sinceStored)
    {
        if (next is null || next.Day is < 1 or > MaxDay || next.Minute is < 0 or >= MinutesPerDay ||
            next.Energy is < 0 or > 100 || next.Location is null || !Locations.Contains(next.Location))
            return LifeSaveVerdict.Invalid;
        if (stored is null) return LifeSaveVerdict.Accepted;

        var advanced = TotalMinutes(next) - TotalMinutes(stored);
        // A slower tab or a second device saving older progress must not rewind the day.
        if (advanced < 0) return LifeSaveVerdict.Stale;
        var realSeconds = Math.Max(0, sinceStored.TotalSeconds);
        if (advanced > realSeconds + SleepAllowanceMinutes + ClockSlackMinutes) return LifeSaveVerdict.TooFarAhead;
        // Energy only rises through sleep (which moves the clock forward) or one meal.
        var maxGain = Math.Ceiling(advanced / 60.0 * EnergyPerHourSlept) + MealEnergyAllowance + 1;
        if (next.Energy - stored.Energy > maxGain) return LifeSaveVerdict.EnergyTooHigh;
        return LifeSaveVerdict.Accepted;
    }
}
