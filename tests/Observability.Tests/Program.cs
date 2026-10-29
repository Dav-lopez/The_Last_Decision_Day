using System.Diagnostics.Metrics;
using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.DependencyInjection;
using TheLastDecision.Api.Observability;

static void Check(bool ok, string description)
{
    if (!ok) throw new Exception("FAIL: " + description);
    Console.WriteLine("PASS: " + description);
}

var samples = new List<(string Instrument, double Value, Dictionary<string, object?> Tags)>();
using var listener = new MeterListener();
listener.InstrumentPublished = (instrument, meterListener) =>
{
    if (instrument.Meter.Name == RequestMetrics.MeterName)
        meterListener.EnableMeasurementEvents(instrument);
};
listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) =>
    samples.Add((instrument.Name, value, tags.ToArray().ToDictionary(x => x.Key, x => x.Value))));
listener.SetMeasurementEventCallback<double>((instrument, value, tags, _) =>
    samples.Add((instrument.Name, value, tags.ToArray().ToDictionary(x => x.Key, x => x.Value))));
listener.Start();

var route = "/api/v1/school/activities/{activityId}/execute";
RequestMetrics.Record("POST", route, 409, 12.5);
Check(samples.Count == 2, "A request emits both count and duration measurements");
Check(samples.Any(x => x.Instrument == "tld.http.requests" && x.Value == 1),
    "Request counter increments once");
Check(samples.Any(x => x.Instrument == "tld.http.duration" && x.Value == 12.5),
    "Duration histogram measures elapsed milliseconds");
Check(samples.All(x => x.Tags.Count == 3 &&
    x.Tags["http.request.method"]?.ToString() == "POST" &&
    x.Tags["http.route"]?.ToString() == route &&
    x.Tags["http.response.status_code"]?.ToString() == "409"),
    "Only bounded HTTP dimensions are exported");

var builder = WebApplication.CreateBuilder();
builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0));
builder.Logging.ClearProviders();
await using var app = builder.Build();
app.UseRequestObservability();
app.MapGet("/ok", () => "ok");
app.MapGet("/boom", () => { throw new InvalidOperationException("internal exception details"); });
await app.StartAsync();
try
{
    var address = app.Services.GetRequiredService<IServer>().Features
        .Get<IServerAddressesFeature>()?.Addresses.Single()
        ?? throw new InvalidOperationException("Kestrel did not report its bound test address.");
    using var client = new HttpClient();
    using var ok = await client.GetAsync(address + "/ok");
    Check(ok.StatusCode == HttpStatusCode.OK, "Successful HTTP requests remain successful");
    using var failed = await client.GetAsync(address + "/boom");
    var body = await failed.Content.ReadAsStringAsync();
    Check(failed.StatusCode == HttpStatusCode.InternalServerError,
        "Unhandled endpoint exceptions return HTTP 500");
    Check(!body.Contains("internal exception details", StringComparison.Ordinal) &&
        !body.Contains("System.InvalidOperationException", StringComparison.Ordinal),
        "Exception details are not disclosed to clients");
    using var json = JsonDocument.Parse(body);
    Check(json.RootElement.GetProperty("status").GetInt32() == 500 &&
        !string.IsNullOrWhiteSpace(json.RootElement.GetProperty("traceId").GetString()),
        "Failure response contains a trace identifier");
    Check(samples.Any(x => x.Instrument == "tld.http.requests" &&
        x.Tags["http.response.status_code"]?.ToString() == "500"),
        "Handled exceptions are counted as HTTP 500 rather than 200");
}
finally
{
    await app.StopAsync();
}
