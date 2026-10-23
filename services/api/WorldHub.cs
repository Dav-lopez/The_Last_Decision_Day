using Microsoft.AspNetCore.SignalR;
namespace TheLastDecision.Api;
public sealed class WorldHub : Hub { public Task<string> Ping() => Task.FromResult("pong"); }
