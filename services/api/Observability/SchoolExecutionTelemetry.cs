using System.Diagnostics;
using System.Diagnostics.Metrics;
using TheLastDecision.Api.School;

namespace TheLastDecision.Api.Observability;

/// <summary>
/// Structured school-action outcomes. Metric dimensions are restricted to server-owned
/// activity identifiers and a fixed outcome vocabulary; never include user IDs or keys.
/// </summary>
public static class SchoolExecutionTelemetry
{
    public const string MeterName = "TheLastDecision.Gameplay";
    public const string MetricName = "tld.school.executions";
    private static readonly Meter Meter = new(MeterName);
    private static readonly Counter<long> Executions = Meter.CreateCounter<long>(
        MetricName, unit: "{execution}", description: "School execution requests by result.");

    private static readonly HashSet<string> Outcomes = new(StringComparer.Ordinal)
    {
        "committed", "replayed", "time_exhausted", "concurrency_conflict",
        "key_conflict", "missing_response", "invalid_history",
        "invalid_attributes", "missing_character", "invalid_key",
        "unknown_activity", "unauthorized"
    };

    public static void Record(ILogger logger, string activity, string outcome,
        Guid? correlationId = null, int? timeCost = null)
    {
        ArgumentNullException.ThrowIfNull(logger);
        if (!Outcomes.Contains(outcome))
            throw new ArgumentOutOfRangeException(nameof(outcome), "Unknown school execution outcome.");

        // Even if a future caller accidentally passes a raw route parameter,
        // the metric and log labels remain bounded to the server catalog.
        var activityLabel = SchoolActivities.Catalog.Any(a => a.Id == activity)
            ? activity : "unknown";
        Executions.Add(1, new KeyValuePair<string, object?>("activity", activityLabel),
            new KeyValuePair<string, object?>("outcome", outcome));

        Activity.Current?.SetTag("tld.school.activity", activityLabel);
        Activity.Current?.SetTag("tld.school.outcome", outcome);
        if (correlationId.HasValue)
            Activity.Current?.SetTag("tld.school.correlation_id", correlationId.Value.ToString("D"));

        if (outcome == "committed")
            logger.LogInformation("School activity committed: activity={Activity} outcome={Outcome} correlationId={CorrelationId} timeCost={TimeCost}",
                activityLabel, outcome, correlationId, timeCost);
        else if (outcome == "replayed")
            logger.LogInformation("School activity replayed: activity={Activity} outcome={Outcome} correlationId={CorrelationId}",
                activityLabel, outcome, correlationId);
        else if (outcome is "concurrency_conflict" or "invalid_history" or "missing_response")
            logger.LogWarning("School activity rejected: activity={Activity} outcome={Outcome}",
                activityLabel, outcome);
        else
            logger.LogInformation("School activity rejected: activity={Activity} outcome={Outcome}",
                activityLabel, outcome);
    }
}
