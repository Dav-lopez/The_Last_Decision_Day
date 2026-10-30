using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TheLastDecision.Api;
using TheLastDecision.Api.Multiplayer;

static void Check(bool value, string name) { if (!value) throw new Exception("FAIL: " + name); Console.WriteLine("PASS: " + name); }
static async Task Fails(Func<Task> action, string name)
{
    try { await action(); } catch (Exception exception) when (exception is HubException or HttpRequestException or InvalidOperationException)
    { Console.WriteLine("PASS: " + name); return; }
    throw new Exception("FAIL: " + name);
}
static async Task Wait(Func<bool> predicate)
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(6));
    while (!predicate()) await Task.Delay(15, timeout.Token);
}

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseTestServer();
builder.Logging.ClearProviders();
builder.Services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, TestAuthentication>("Test", _ => { });
builder.Services.AddAuthorization();
builder.Services.AddAntiforgery(options => { options.HeaderName = "X-CSRF-TOKEN"; });
builder.Services.AddSignalR(options => options.MaximumReceiveMessageSize = 4096);
builder.Services.AddSingleton(TimeProvider.System); builder.Services.AddSingleton<WorldRooms>();
builder.Services.AddSingleton<IWorldPlayerDirectory, TestDirectory>();
var app = builder.Build();
app.UseAuthentication(); app.UseAuthorization(); app.UseAntiforgery();
app.UseWebSockets();
app.Use((context, next) => WorldTransportSecurity.Validate(context, next, app.Configuration));
app.MapGet("/api/v1/auth/csrf", (IAntiforgery tokens, HttpContext context) => Results.Json(new { token = tokens.GetAndStoreTokens(context).RequestToken }));
app.MapHub<WorldHub>("/hubs/world").RequireAuthorization();
await app.StartAsync();

async Task<HubConnection> Client(string? user, string origin = "https://the-last-decision-day.pages.dev", bool withCsrf = true)
{
    using var http = app.GetTestClient(); http.BaseAddress = new Uri("https://localhost");
    if (user is not null) http.DefaultRequestHeaders.Add("X-Test-User", user);
    var csrf = await http.GetAsync("/api/v1/auth/csrf");
    var token = (await csrf.Content.ReadFromJsonAsync<Csrf>())!.Token;
    var cookie = string.Join("; ", csrf.Headers.GetValues("Set-Cookie").Select(value => value.Split(';')[0]));
    return new HubConnectionBuilder().WithUrl("https://localhost/hubs/world", options =>
    {
        options.Transports = HttpTransportType.LongPolling;
        options.HttpMessageHandlerFactory = _ => app.GetTestServer().CreateHandler();
        if (user is not null) options.Headers["X-Test-User"] = user;
        options.Headers["Origin"] = origin; options.Headers["Cookie"] = cookie;
        if (withCsrf) options.Headers["X-CSRF-TOKEN"] = token;
    }).Build();
}

await using var anonymous = await Client(null);
await Fails(() => anonymous.StartAsync(), "anonymous clients cannot connect");
await using var badOrigin = await Client("alice", "https://untrusted.example");
await Fails(() => badOrigin.StartAsync(), "foreign origins cannot negotiate an authenticated room");
await using var noCsrf = await Client("alice", withCsrf: false);
await Fails(() => noCsrf.StartAsync(), "negotiation requires the session-bound antiforgery token");

await using var alice = await Client("alice"); await using var bob = await Client("bob"); await using var carol = await Client("carol");
var aliceMessages = new ConcurrentQueue<WorldMessage>(); var bobMessages = new ConcurrentQueue<WorldMessage>();
var aliceRosters = new ConcurrentQueue<RoomRoster>(); var bobRosters = new ConcurrentQueue<RoomRoster>();
var bobPoses = new ConcurrentQueue<WorldPlayer>();
alice.On<WorldMessage>("RoomMessage", message => aliceMessages.Enqueue(message));
bob.On<WorldMessage>("RoomMessage", message => bobMessages.Enqueue(message));
alice.On<RoomRoster>("RoomRoster", roster => aliceRosters.Enqueue(roster));
bob.On<RoomRoster>("RoomRoster", roster => bobRosters.Enqueue(roster));
bob.On<WorldPlayer>("PlayerPose", player => bobPoses.Enqueue(player));
await alice.StartAsync(); await bob.StartAsync(); await carol.StartAsync();
var created = await alice.InvokeAsync<RoomSnapshot>("CreateRoom");
var joined = await bob.InvokeAsync<RoomSnapshot>("JoinRoom", created.Code);
await Wait(() => aliceRosters.Any(roster => roster.Players.Length == 2));
Check(joined.Players.Length == 2 && joined.SelfId != created.SelfId, "two independent clients join the same room with distinct server identities");
await Fails(() => carol.InvokeAsync<RoomSnapshot>("JoinRoom", created.Code), "third player cannot exceed room capacity");
var request = Guid.NewGuid();
var sent = await alice.InvokeAsync<WorldMessage>("SendMessage", request, "hello from device one");
await Wait(() => bobMessages.Count == 1 && aliceMessages.Count == 1);
Check(bobMessages.Single().Text == "hello from device one" && sent.SenderName == "Alice", "chat crosses clients and uses server-owned display names");
var repeated = await alice.InvokeAsync<WorldMessage>("SendMessage", request, "hello from device one");
Check(repeated.Id == sent.Id && bobMessages.Count == 1, "retrying a delivered message does not duplicate it");
await bob.InvokeAsync<WorldMessage>("SendMessage", Guid.NewGuid(), "hello back");
await Wait(() => aliceMessages.Count == 2 && bobMessages.Count == 2);
await alice.InvokeAsync("PublishPose", new WorldPose(2, 4, .5, "street", 1.8, "walking"));
await Wait(() => bobPoses.Count > 0);
Check(bobPoses.Last().CharacterId == created.SelfId && bobPoses.Last().Pose!.X == 2, "peer position updates cross the live hub");
await Fails(() => alice.InvokeAsync("PublishPose", new WorldPose(9000, 0, 0, "street", 0, "walking")), "invalid world coordinates are rejected");
await Fails(() => alice.InvokeAsync<WorldMessage>("SendMessage", Guid.NewGuid(), new string('x', 281)), "oversized messages are rejected");
var privateRoom = await carol.InvokeAsync<RoomSnapshot>("CreateRoom");
await carol.InvokeAsync<WorldMessage>("SendMessage", Guid.NewGuid(), "private to a different room");
Check(aliceMessages.Count == 2 && bobMessages.Count == 2, "messages do not leak between rooms");
await alice.StopAsync(); await Wait(() => bobRosters.Any(roster => roster.Players.Length == 1));
await using var reconnected = await Client("alice"); await reconnected.StartAsync();
var resumed = await reconnected.InvokeAsync<RoomSnapshot>("JoinRoom", created.Code);
Check(resumed.SelfId == created.SelfId && resumed.Players.Length == 2 && resumed.Messages.Length == 2, "reconnect restores room membership and bounded message history");
await Fails(() => alice.InvokeAsync<WorldMessage>("SendMessage", Guid.NewGuid(), "offline"), "closed connections cannot send");

var wasReplaced = false;
reconnected.On("SessionReplaced", () => wasReplaced = true);
await using var replacement = await Client("alice"); await replacement.StartAsync();
await replacement.InvokeAsync<RoomSnapshot>("JoinRoom", privateRoom.Code);
await Wait(() => wasReplaced);
await Fails(() => reconnected.InvokeAsync<WorldMessage>("SendMessage", Guid.NewGuid(), "old connection"), "same-account replacement revokes the old live connection");
var replacementMessages = new ConcurrentQueue<WorldMessage>();
replacement.On<WorldMessage>("RoomMessage", replacementMessages.Enqueue);
await bob.InvokeAsync<WorldMessage>("SendMessage", Guid.NewGuid(), "old room only");
await replacement.InvokeAsync<WorldMessage>("SendMessage", Guid.NewGuid(), "new room only");
await Wait(() => replacementMessages.Count == 1 && bobMessages.Count == 3);
Check(replacementMessages.Single().Text == "new room only" && bobMessages.Last().Text == "old room only", "moving rooms removes the old group before delivering new messages");

var clock = new ManualClock(); var rooms = new WorldRooms(clock);
var who = new WorldIdentity(Guid.NewGuid(), "First"); var room = rooms.Create("first", who);
rooms.Join("second", new WorldIdentity(Guid.NewGuid(), "Second"), room.Snapshot.Code);
var successes = 0;
var empty = rooms.Create("owner", new WorldIdentity(Guid.NewGuid(), "Owner"));
await Task.WhenAll(Enumerable.Range(0, 2).Select(index => Task.Run(() =>
{
    try { rooms.Join("racer" + index, new WorldIdentity(Guid.NewGuid(), "Racer"), empty.Snapshot.Code); Interlocked.Increment(ref successes); } catch (HubException) { }
})));
Check(successes == 1, "simultaneous joins cannot overfill a room");
rooms.Join("replacement", who, room.Snapshot.Code);
Check(rooms.Leave("first") is null, "late disconnect does not remove a reconnected character");
await Fails(() => Task.Run(() => rooms.Send("first", Guid.NewGuid(), "stale")), "a replaced connection cannot send as the current player");
for (var i = 0; i < 5; i++) rooms.Send("replacement", Guid.NewGuid(), "message " + i);
await Fails(() => Task.Run(() => rooms.Send("replacement", Guid.NewGuid(), "spam")), "chat has a per-character rate limit");
rooms.Leave("owner"); rooms.Leave("racer0"); rooms.Leave("racer1"); clock.Advance(TimeSpan.FromMinutes(3));
await Fails(() => Task.Run(() => rooms.Join("late", who, empty.Snapshot.Code)), "empty rooms expire after the reconnect grace period");
await app.StopAsync(); await app.DisposeAsync();
Console.WriteLine("Multiplayer protocol checks passed.");

public sealed record Csrf(string Token);
public sealed class ManualClock : TimeProvider
{
    private DateTimeOffset now = new(2026, 10, 30, 12, 0, 0, TimeSpan.Zero);
    public override DateTimeOffset GetUtcNow() => now;
    public void Advance(TimeSpan elapsed) => now += elapsed;
}
public sealed class TestDirectory : IWorldPlayerDirectory
{
    public Task<WorldIdentity?> FindAsync(Guid userId, CancellationToken cancellationToken) => Task.FromResult<WorldIdentity?>(
        userId == TestAuthentication.Alice ? new WorldIdentity(Guid.Parse("aaaaaaaa-1111-1111-1111-111111111111"), "Alice")
        : userId == TestAuthentication.Bob ? new WorldIdentity(Guid.Parse("bbbbbbbb-2222-2222-2222-222222222222"), "Bob")
        : new WorldIdentity(Guid.Parse("cccccccc-3333-3333-3333-333333333333"), "Carol"));
}
public sealed class TestAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public static readonly Guid Alice = Guid.Parse("11111111-1111-1111-1111-111111111111");
    public static readonly Guid Bob = Guid.Parse("22222222-2222-2222-2222-222222222222");
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var user = Request.Headers["X-Test-User"].ToString();
        if (string.IsNullOrEmpty(user)) return Task.FromResult(AuthenticateResult.NoResult());
        var id = user == "alice" ? Alice : user == "bob" ? Bob : Guid.Parse("33333333-3333-3333-3333-333333333333");
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, id.ToString())], "Test");
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), "Test")));
    }
}
