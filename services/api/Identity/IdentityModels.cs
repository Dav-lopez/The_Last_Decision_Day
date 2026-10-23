namespace TheLastDecision.Api.Identity;

/// <summary>Private adult account identity; never serialize DateOfBirth to public character APIs.</summary>
public sealed class GameUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string EmailNormalized { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public DateOnly DateOfBirth { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public bool IsDisabled { get; set; }
}

/// <summary>Only a salted hash of an invite token is persisted; raw tokens are never stored.</summary>
public sealed class GameInvite
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TokenHash { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RedeemedAt { get; set; }
    public Guid? RedeemedByUserId { get; set; }
}

/// <summary>Deterministic eligibility rules; not a substitute for secure registration and proof of age.</summary>
public static class AdultEligibility
{
    public static bool IsAtLeast18(DateOnly birthDate, DateOnly today)
    {
        if (birthDate > today) return false;
        var eighteenthBirthday = birthDate.AddYears(18);
        return eighteenthBirthday <= today;
    }

    public static string NormalizeEmail(string email)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(email);
        var normalized = email.Trim().ToUpperInvariant();
        if (normalized.Length > 254 || normalized.Contains(' ') || normalized.Count(c => c == '@') != 1 ||
            normalized.StartsWith('@') || normalized.EndsWith('@'))
            throw new ArgumentException("Invalid email address.", nameof(email));
        return normalized;
    }
}
