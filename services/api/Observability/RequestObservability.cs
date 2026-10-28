using System.Diagnostics;
using System.Security.Claims;
using Microsoft.AspNetCore.Diagnostics;

namespace TheLastDecision.Api.Observability;

/// <summary>
/// Emits one structured completion event per HTTP request without logging credentials,
/// cookies, query strings, request bodies, or user-provided path segments.
/// </summary>
public static class RequestObservability
{
    public static void ConfigureLogging(WebApplicationBuilder builder)
    {
        builder.Logging.ClearProviders();
        builder.Logging.AddJsonConsole(options =>
        {
            options.IncludeScopes = true;
            options.TimestampFormat = "yyyy-MM-ddTHH:mm:ss.fffZ";
            options.UseUtcTimestamp = true;
        });
    }

    public static void UseRequestObservability(this WebApplication app)
    {
        app.UseExceptionHandler(handler =>
        {
            handler.Run(async context =>
            {
                var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
                var logger = context.RequestServices.GetRequiredService<ILoggerFactory>()
                    .CreateLogger("TheLastDecision.UnhandledException");
                logger.LogError(exception, "Unhandled request failure; traceId={TraceId}",
                    Activity.Current?.Id ?? context.TraceIdentifier);
                context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                context.Response.ContentType = "application/problem+json";
                await context.Response.WriteAsJsonAsync(new
                {
                    type = "about:blank",
                    title = "An unexpected error occurred.",
                    status = 500,
                    traceId = Activity.Current?.Id ?? context.TraceIdentifier
                });
            });
        });

        app.Use(async (context, next) =>
        {
            var started = Stopwatch.GetTimestamp();
            var traceId = Activity.Current?.Id ?? context.TraceIdentifier;
            var logger = context.RequestServices.GetRequiredService<ILoggerFactory>()
                .CreateLogger("TheLastDecision.HttpRequest");
            using (logger.BeginScope(new Dictionary<string, object>
            {
                ["TraceId"] = traceId,
                ["RequestId"] = context.TraceIdentifier
            }))
            {
                try
                {
                    await next();
                }
                finally
                {
                    var elapsedMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
                    // Endpoint route patterns are application-defined; raw URLs can include
                    // emails, identifiers, tokens or other sensitive player information.
                    var route = (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? "unmatched";
                    var status = context.Response.StatusCode;
                    if (status >= 500)
                        logger.LogError("HTTP request completed: method={Method} route={Route} status={StatusCode} durationMs={DurationMs}",
                            context.Request.Method, route, status, elapsedMs);
                    else if (status >= 400)
                        logger.LogWarning("HTTP request completed: method={Method} route={Route} status={StatusCode} durationMs={DurationMs}",
                            context.Request.Method, route, status, elapsedMs);
                    else
                        logger.LogInformation("HTTP request completed: method={Method} route={Route} status={StatusCode} durationMs={DurationMs}",
                            context.Request.Method, route, status, elapsedMs);
                }
            }
        });
    }
}
