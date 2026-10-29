using OpenTelemetry.Exporter;
using OpenTelemetry.Metrics;

namespace TheLastDecision.Api.Observability;

/// <summary>
/// Optional outbound OTLP/HTTP metrics export. No collector, credentials, or
/// network connection is required when the endpoint is not configured.
/// </summary>
public static class OtlpMetrics
{
    public static void Configure(WebApplicationBuilder builder)
    {
        var rawEndpoint = builder.Configuration["Observability:OtlpMetricsEndpoint"];
        if (string.IsNullOrWhiteSpace(rawEndpoint))
            return;

        var endpoint = ParseEndpoint(rawEndpoint);
        // Secrets are supplied only through deployment configuration, never
        // through source code or metric dimensions.
        var headers = builder.Configuration["Observability:OtlpHeaders"];
        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics => metrics
                .AddMeter(RequestMetrics.MeterName, SchoolExecutionTelemetry.MeterName)
                .AddOtlpExporter(options =>
                {
                    options.Protocol = OtlpExportProtocol.HttpProtobuf;
                    options.Endpoint = endpoint;
                    if (!string.IsNullOrWhiteSpace(headers))
                        options.Headers = headers;
                }));
    }

    public static Uri ParseEndpoint(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var endpoint) ||
            !(endpoint.Scheme == Uri.UriSchemeHttps ||
              (endpoint.Scheme == Uri.UriSchemeHttp && endpoint.IsLoopback)) ||
            !string.IsNullOrEmpty(endpoint.UserInfo) ||
            !string.IsNullOrEmpty(endpoint.Query) ||
            !string.IsNullOrEmpty(endpoint.Fragment) ||
            !endpoint.AbsolutePath.EndsWith("/v1/metrics", StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "Observability:OtlpMetricsEndpoint must be an HTTPS OTLP/HTTP /v1/metrics URL " +
                "(or loopback HTTP for local development), without embedded credentials or query parameters.");
        }

        return endpoint;
    }
}
