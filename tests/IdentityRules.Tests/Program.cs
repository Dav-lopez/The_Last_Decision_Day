using TheLastDecision.Api.Identity;

static void Assert(bool value, string name)
{
    if (!value) throw new Exception("FAIL: " + name);
    Console.WriteLine("PASS: " + name);
}
var today = new DateOnly(2026, 10, 23);
Assert(AdultEligibility.IsAtLeast18(new DateOnly(2008, 10, 23), today), "18th birthday qualifies");
Assert(!AdultEligibility.IsAtLeast18(new DateOnly(2008, 10, 24), today), "one day before 18th birthday rejected");
Assert(!AdultEligibility.IsAtLeast18(new DateOnly(2030, 1, 1), today), "future date rejected");
Assert(AdultEligibility.IsAtLeast18(new DateOnly(2000, 2, 29), today), "leap day adult qualifies");
Assert(AdultEligibility.NormalizeEmail("  example@domain.test ") == "EXAMPLE@DOMAIN.TEST", "email normalization");
try
{
    AdultEligibility.NormalizeEmail("invalid");
    throw new Exception("FAIL: invalid email accepted");
}
catch (ArgumentException) { Console.WriteLine("PASS: invalid email rejected"); }

var proxyOptions = new Microsoft.AspNetCore.Builder.ForwardedHeadersOptions();
TheLastDecision.Api.Identity.TrustedProxyHeaders.Configure(proxyOptions);
Assert(proxyOptions.ForwardLimit == 1, "forwarded header chain limited to one hop");
Assert(proxyOptions.ForwardedHeaders ==
    (Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor |
     Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto),
    "only client address and scheme forwarding enabled");
Assert(proxyOptions.KnownProxies.Count == 2 &&
    proxyOptions.KnownProxies.Contains(System.Net.IPAddress.Loopback) &&
    proxyOptions.KnownProxies.Contains(System.Net.IPAddress.IPv6Loopback),
    "only loopback proxies trusted");
Assert(proxyOptions.KnownIPNetworks.Count == 0, "no arbitrary forwarded networks trusted");
