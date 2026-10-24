using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;

namespace TheLastDecision.Api.Identity;

/// <summary>
/// Captures a Cloudflare Pages client IP only when the immediate connection is
/// loopback (the local Caddy proxy) and the edge-to-origin shared secret matches.
/// Must run BEFORE UseForwardedHeaders, which replaces RemoteIpAddress.
/// </summary>
public static class TrustedEdgeClientIp
{
    public const string IpHeader = "X-TLD-Client-IP";
    public const string SecretHeader = "X-TLD-Edge-Secret";
    private static readonly object VerifiedIpKey = new();

    public static void Capture(HttpContext context, string? configuredSecret)
    {
        if (string.IsNullOrWhiteSpace(configuredSecret) ||
            context.Connection.RemoteIpAddress is not { } peer ||
            !IPAddress.IsLoopback(peer) ||
            !context.Request.Headers.TryGetValue(IpHeader, out var ipValues) ||
            ipValues.Count != 1 ||
            !context.Request.Headers.TryGetValue(SecretHeader, out var secretValues) ||
            secretValues.Count != 1)
            return;

        // Reject accidental low-entropy configuration and compare without early-exit
        // on secret content. Never log or reflect either secret header.
        var expected = Encoding.UTF8.GetBytes(configuredSecret);
        var supplied = Encoding.UTF8.GetBytes(secretValues[0] ?? "");
        if (expected.Length < 32 || expected.Length != supplied.Length ||
            !CryptographicOperations.FixedTimeEquals(expected, supplied))
            return;

        if (!IPAddress.TryParse(ipValues[0], out var address) ||
            address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any))
            return;

        context.Items[VerifiedIpKey] = (address.IsIPv4MappedToIPv6
            ? address.MapToIPv4()
            : address).ToString();
    }

    public static string RateLimitKey(HttpContext context) =>
        context.Items.TryGetValue(VerifiedIpKey, out var value) && value is string verified
            ? verified
            : context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}
