namespace TheLastDecision.Api.Identity;

/// <summary>PostgreSQL concurrency/constraint conflicts expected under concurrent registration.</summary>
public static class RegistrationDatabaseErrors
{
    public static bool IsConflictSqlState(string? sqlState) =>
        sqlState is "40001" or "40P01" or "23505";
}
