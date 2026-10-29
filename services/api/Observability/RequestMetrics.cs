using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace TheLastDecision.Api.Observability;

/// <summary>
/// Low-cardinality server-side metrics for request volume and duration.
/// No user IDs, request paths, query strings or other player-supplied tags.
/// Consumers can attach a MeterListener or an OpenTelemetry Meter provider.
/// </summary>
public static class RequestMetrics
{
    public const string MeterName = "TheLastDecision.Api";
    private static readonly Meter Meter = new(MeterName);
    private static readonly Counter<long> RequestCount =
        Meter.CreateCounter<long>("tld.http.requests", "requests", "Completed HTTP requests");
    private static readonly Histogram<double> RequestDuration =
        Meter.CreateHistogram<double>("tld.http.duration", "ms", "HTTP request duration");

    public static void Record(string method, string route, int statusCode, double durationMs)
    {
        // Callers must pass a matched server-defined route template, not Request.Path.
        // Keep dimensions bounded to avoid accidental per-player time series.
        // HTTP method is client-controlled. Collapse unknown verbs into a single bucket
        // so arbitrary method names cannot create unbounded metric dimensions.
        var normalizedMethod = method switch
        {
            "GET" or "HEAD" or "POST" or "PUT" or "PATCH" or "DELETE" or
            "OPTIONS" or "TRACE" or "CONNECT" => method,
            _ => "OTHER"
        };
        var tags = new TagList
        {
            { "http.request.method", normalizedMethod },
            { "http.route", route },
            { "http.response.status_code", statusCode }
        };
        RequestCount.Add(1, in tags);
        RequestDuration.Record(durationMs, in tags);
    }
}
