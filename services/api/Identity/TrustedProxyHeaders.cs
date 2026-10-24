using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;

namespace TheLastDecision.Api.Identity;

/// <summary>
/// Accept forwarding metadata only from a local reverse proxy (Caddy/nginx).
/// Do not trust arbitrary X-Forwarded-* headers sent by internet clients.
/// </summary>
public static class TrustedProxyHeaders
{
    public static void Configure(ForwardedHeadersOptions options)
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.ForwardLimit = 1;
        options.KnownProxies.Clear();
        options.KnownIPNetworks.Clear();
        options.KnownProxies.Add(IPAddress.Loopback);
        options.KnownProxies.Add(IPAddress.IPv6Loopback);
    }
}
