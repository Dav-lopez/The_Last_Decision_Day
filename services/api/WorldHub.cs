using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;
using TheLastDecision.Api.Multiplayer;
namespace TheLastDecision.Api;
[Authorize]
public sealed class WorldHub(WorldRooms rooms, IWorldPlayerDirectory directory) : Hub
{
    private WorldIdentity Player => Context.Items.TryGetValue("world-player", out var value) && value is WorldIdentity identity
        ? identity : throw new HubException("Create a character before joining multiplayer.");

    public override async Task OnConnectedAsync()
    {
        if (!Guid.TryParse(Context.UserIdentifier, out var userId)) throw new HubException("Sign in to play together.");
        var player = await directory.FindAsync(userId, Context.ConnectionAborted);
        if (player is null) throw new HubException("Create a character before joining multiplayer.");
        Context.Items["world-player"] = player;
        await base.OnConnectedAsync();
    }
    public Task<string> Ping() => Task.FromResult("pong");
    private async Task<T> Serialized<T>(Func<Task<T>> action)
    {
        await rooms.TransportGate.WaitAsync();
        try { return await action(); } finally { rooms.TransportGate.Release(); }
    }
    public Task<RoomSnapshot> CreateRoom() => Serialized(() => ApplyJoin(rooms.Create(Context.ConnectionId, Player)));
    public Task<RoomSnapshot> JoinRoom(string code) => Serialized(() => ApplyJoin(rooms.Join(Context.ConnectionId, Player, code)));
    private async Task<RoomSnapshot> ApplyJoin(RoomJoin result)
    {
        foreach (var departure in result.Departures)
        {
            await Groups.RemoveFromGroupAsync(departure.ConnectionId, departure.Roster.Code);
            if (departure.ConnectionId != Context.ConnectionId) await Clients.Client(departure.ConnectionId).SendAsync("SessionReplaced");
            await Clients.Group(departure.Roster.Code).SendAsync("RoomRoster", departure.Roster);
        }
        await Groups.AddToGroupAsync(Context.ConnectionId, result.Snapshot.Code);
        await Clients.Group(result.Snapshot.Code).SendAsync("RoomRoster", new RoomRoster(result.Snapshot.Code, result.Snapshot.Players));
        return result.Snapshot;
    }
    public Task LeaveRoom() => Serialized(async () =>
    {
        var departure = rooms.Leave(Context.ConnectionId);
        if (departure is null) return true;
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, departure.Roster.Code);
        await Clients.Group(departure.Roster.Code).SendAsync("RoomRoster", departure.Roster);
        return true;
    });
    public Task<WorldMessage> SendMessage(Guid clientMessageId, string text) => Serialized(async () =>
    {
        var result = rooms.Send(Context.ConnectionId, clientMessageId, text);
        if (result.IsNew) await Clients.Group(result.Code).SendAsync("RoomMessage", result.Message);
        return result.Message;
    });
    public Task PublishPose(WorldPose pose) => Serialized(async () =>
    {
        var result = rooms.Publish(Context.ConnectionId, pose);
        if (result is not null) await Clients.OthersInGroup(result.Value.Code).SendAsync("PlayerPose", result.Value.Player);
        return true;
    });
    public Task SendEmote(string emote) => Serialized(async () =>
    {
        var result = rooms.Emote(Context.ConnectionId, emote);
        await Clients.OthersInGroup(result.Code).SendAsync("PlayerEmote", result.Emote);
        return true;
    });
    public Task SendSignal(string kind, string payload) => Serialized(async () =>
    {
        var result = rooms.Signal(Context.ConnectionId, kind, payload);
        await Clients.OthersInGroup(result.Code).SendAsync("VoiceSignal", result.Signal);
        return true;
    });
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await Serialized(async () =>
        {
            var departure = rooms.Leave(Context.ConnectionId);
            if (departure is not null) await Clients.Group(departure.Roster.Code).SendAsync("RoomRoster", departure.Roster);
            return true;
        });
        await base.OnDisconnectedAsync(exception);
    }
}
