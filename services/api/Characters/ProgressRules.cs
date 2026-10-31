using System.Text.Json;

namespace TheLastDecision.Api.Characters;

/// <summary>A progress save from the browser: when it last changed (ms since 1970) and the document itself.</summary>
public sealed record ProgressSave(long SavedAt, JsonElement Data);

public enum ProgressSaveVerdict { Accepted, Invalid, Stale }

/// <summary>
/// Story, career (with training record) and neighbour relationships are saved as one JSON document.
/// The browser owns the game rules; the server keeps the newest copy per character and refuses
/// a copy older than the one it has, so two devices converge on the most recent play.
/// </summary>
public static class ProgressRules
{
    /// <summary>Generous cap: a full save is about 2 KB.</summary>
    public const int MaxDocumentBytes = 32 * 1024;
    /// <summary>Allowed clock skew for a browser whose clock runs ahead of the server's.</summary>
    public static readonly TimeSpan MaxClockAhead = TimeSpan.FromMinutes(10);
    public static readonly string[] RequiredSections = ["story", "career", "relations"];

    public static ProgressSaveVerdict Validate(ProgressSave? next, long? storedSavedAt, DateTimeOffset now)
    {
        if (next is null || next.SavedAt <= 0) return ProgressSaveVerdict.Invalid;
        if (next.SavedAt > (now + MaxClockAhead).ToUnixTimeMilliseconds()) return ProgressSaveVerdict.Invalid;
        if (next.Data.ValueKind != JsonValueKind.Object) return ProgressSaveVerdict.Invalid;
        foreach (var section in RequiredSections)
            if (!next.Data.TryGetProperty(section, out var value) || value.ValueKind != JsonValueKind.Object)
                return ProgressSaveVerdict.Invalid;
        if (next.Data.GetRawText().Length > MaxDocumentBytes) return ProgressSaveVerdict.Invalid;
        if (storedSavedAt is { } stored && next.SavedAt < stored) return ProgressSaveVerdict.Stale;
        return ProgressSaveVerdict.Accepted;
    }
}
