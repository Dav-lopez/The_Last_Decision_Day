using Microsoft.AspNetCore.Antiforgery;

namespace TheLastDecision.Api.Multiplayer;

public static class WorldTransportSecurity
{
    public static async Task Validate(HttpContext context, RequestDelegate next, IConfiguration configuration)
    {
        if (!context.Request.Path.StartsWithSegments("/hubs/world")) { await next(context); return; }
        if (context.User.Identity?.IsAuthenticated != true) { context.Response.StatusCode = 401; return; }
        var origin = context.Request.Headers.Origin.ToString();
        var allowed = configuration.GetSection("Multiplayer:AllowedOrigins").Get<string[]>() ?? ["https://the-last-decision-day.pages.dev"];
        if ((context.WebSockets.IsWebSocketRequest && string.IsNullOrWhiteSpace(origin)) ||
            (!string.IsNullOrWhiteSpace(origin) && !allowed.Contains(origin, StringComparer.Ordinal)))
        { context.Response.StatusCode = 403; return; }
        if (HttpMethods.IsPost(context.Request.Method))
        {
            var antiforgery = context.RequestServices.GetRequiredService<IAntiforgery>();
            if (!await antiforgery.IsRequestValidAsync(context)) { context.Response.StatusCode = 400; return; }
        }
        await next(context);
    }
}
