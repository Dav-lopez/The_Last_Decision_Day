using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace TheLastDecision.Api.Observability;

/// <summary>
/// Low-cardinality school execution outcomes for troubleshooting and metrics.
/// Never pass user identifiers, request keys, or unvalidated activity IDs as labels.
/// </summary>
public static class SchoolExecutionTelemetry
{
    public const string MeterName = "TheLastDecision.Gameplay";
    public const string MetricName = "tld.school.executions";
    private static readonly Meter Meter = new(MeterName);
    private static readonly Counter<long> Executions = Meter.CreateCounter<long>(
        MetricName, unit: "{execution}", description: "School execution requests by result.");

    public static void Record(ILogger logger, string activity, string outcome,
        Guid? correlationId = null, int? timeCost = null)
    {
        // activity must come from the server-owned catalog or the fixed "unknown" label.
        // outcome must be a fixed code defined by the caller, not user-supplied text.
        Executions.Add(1, new KeyValuePair<string, object?>("activity", activity),
            new KeyValuePair<string, object?>("outcome", outcome));
        Activity.Current?.SetTag("tld.school.activity", activity);
        Activity.Current?.SetTag("tld.school.outcome", outcome);
        if (correlationId.HasValue)
            Activity.Current?.SetTag("tld.school.correlation_id", correlationId.Value.ToString("D"));

        if (outcome == "committed")
            logger.LogInformation("School activity committed: activity={Activity} outcome={Outcome} correlationId={CorrelationId} timeCost={TimeCost}",
                activity, outcome, correlationId, timeCost);
        else if (outcome == "replayed")
            logger.LogInformation("School activity replayed: activity={Activity} outcome={Outcome} correlationId={CorrelationId}",
                activity, outcome, correlationId);
        else if (outcome is "concurrency_conflict" or "invalid_history" or "missing_response")
            logger.LogWarning("School activity rejected: activity={Activity} outcome={Outcome}",
                activity, outcome);
        else
            logger.LogInformation("School activity rejected: activity={Activity} outcome={Outcome}",
                activity, outcome);
    }
}
