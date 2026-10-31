using System.Security.Cryptography;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace TheLastDecision.Api.Multiplayer;

public sealed record WorldIdentity(Guid CharacterId, string Name);
// Optional final parameter preserves clients that do not yet publish body type.
public sealed record WorldPose(double X, double Z, double Rotation, string Location, double Speed, string Mode, string Body = "male");
public sealed record WorldPlayer(Guid CharacterId, string Name, WorldPose? Pose);
public sealed record WorldMessage(Guid Id, Guid SenderId, string SenderName, string Text, long Sequence, DateTimeOffset SentAt, Guid ClientMessageId);
public sealed record RoomSnapshot(string Code, Guid SelfId, WorldPlayer[] Players, WorldMessage[] Messages);
public sealed record RoomRoster(string Code, WorldPlayer[] Players);
public sealed record RoomDeparture(string ConnectionId, RoomRoster Roster);
public sealed record RoomJoin(RoomSnapshot Snapshot, RoomDeparture[] Departures);
/// <summary>A quick emote shown over the sender's avatar (from a fixed list).</summary>
public sealed record WorldEmote(Guid CharacterId, string Name, string Emote);
/// <summary>WebRTC voice signaling relayed to the other player in the room (offer, answer, ICE candidate, hang-up).</summary>
public sealed record WorldSignal(Guid From, string Kind, string Payload);

public interface IWorldPlayerDirectory
{
    Task<WorldIdentity?> FindAsync(Guid userId, CancellationToken cancellationToken);
}

public sealed class WorldPlayerDirectory(GameDbContext db) : IWorldPlayerDirectory
{
    public Task<WorldIdentity?> FindAsync(Guid userId, CancellationToken cancellationToken) => db.Characters.AsNoTracking()
        .Where(character => character.UserId == userId)
        .Select(character => new WorldIdentity(character.Id, character.DisplayName)).SingleOrDefaultAsync(cancellationToken);
}

/// <summary>One-instance, bounded live sessions. No chat or room state is written to account saves.</summary>
public sealed class WorldRooms(TimeProvider clock)
{
    public const int Capacity = 2;
    // Serialize store changes with their asynchronous SignalR group updates.
    public SemaphoreSlim TransportGate { get; } = new(1, 1);
    private sealed class Member(string connection, WorldIdentity identity)
    {
        public string Connection { get; } = connection;
        public WorldIdentity Identity { get; } = identity;
        public WorldPose? Pose { get; set; }
        public DateTimeOffset LastPose { get; set; } = DateTimeOffset.MinValue;
    }
    private sealed class Room(string code, DateTimeOffset now)
    {
        public string Code { get; } = code;
        public Dictionary<Guid, Member> Members { get; } = [];
        public List<WorldMessage> Messages { get; } = [];
        public long Sequence { get; set; }
        public DateTimeOffset LastUsed { get; set; } = now;
    }
    private readonly object gate = new();
    private readonly Dictionary<string, Room> rooms = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> membership = new(StringComparer.Ordinal);
    private readonly Dictionary<Guid, string> characterConnections = [];
    private readonly Dictionary<(Guid, string), Queue<DateTimeOffset>> budgets = [];

    public static IReadOnlyList<string> Emotes { get; } = ["wave", "cheer", "dance", "thumbs-up", "laugh", "follow-me", "over-here", "nice"];
    public static IReadOnlyList<string> SignalKinds { get; } = ["offer", "answer", "ice", "hangup"];
    public const int MaxSignalLength = 12_000;

    public (string Code, WorldEmote Emote) Emote(string connection, string? emote)
    {
        lock (gate)
        {
            var (room, member) = MemberOf(connection);
            if (emote is null || !Emotes.Contains(emote)) throw new HubException("Unknown emote.");
            Limit(member.Identity.CharacterId, "emote", 6, TimeSpan.FromSeconds(10));
            room.LastUsed = clock.GetUtcNow();
            return (room.Code, new WorldEmote(member.Identity.CharacterId, member.Identity.Name, emote));
        }
    }

    /// <summary>Validates a voice signaling message; the server never reads or stores the SDP/ICE payload.</summary>
    public (string Code, WorldSignal Signal) Signal(string connection, string? kind, string? payload)
    {
        lock (gate)
        {
            var (room, member) = MemberOf(connection);
            if (kind is null || !SignalKinds.Contains(kind)) throw new HubException("Unknown voice signal.");
            if (payload is null || payload.Length > MaxSignalLength) throw new HubException("Voice signal too large.");
            if (room.Members.Count < 2 && kind != "hangup") throw new HubException("Wait for your friend to join before starting voice.");
            Limit(member.Identity.CharacterId, "signal", 120, TimeSpan.FromSeconds(10));
            room.LastUsed = clock.GetUtcNow();
            return (room.Code, new WorldSignal(member.Identity.CharacterId, kind, payload));
        }
    }

    public static string NormalizeCode(string? code)
    {
        if (code is null || code.Length > 24) throw new HubException("Enter the 16-character room code.");
        var normalized = string.Concat(code.Where(character => character != '-' && !char.IsWhiteSpace(character))).ToUpperInvariant();
        if (normalized.Length != 16 || !normalized.All(char.IsAsciiHexDigit)) throw new HubException("Enter the 16-character room code.");
        return normalized;
    }

    public RoomJoin Create(string connection, WorldIdentity identity)
    {
        lock (gate)
        {
            Cleanup(); Limit(identity.CharacterId, "room", 6, TimeSpan.FromMinutes(1));
            if (rooms.Count >= 128) throw new HubException("Rooms are busy. Try again shortly.");
            string code;
            do { code = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)); } while (rooms.ContainsKey(code));
            var room = new Room(code, clock.GetUtcNow()); rooms.Add(code, room);
            return Move(connection, identity, room);
        }
    }

    public RoomJoin Join(string connection, WorldIdentity identity, string code)
    {
        lock (gate)
        {
            Cleanup(); Limit(identity.CharacterId, "room", 6, TimeSpan.FromMinutes(1));
            if (!rooms.TryGetValue(NormalizeCode(code), out var room)) throw new HubException("Room expired or not found. Ask your friend for a new code.");
            if (!room.Members.ContainsKey(identity.CharacterId) && room.Members.Count >= Capacity) throw new HubException("This two-player room is full.");
            return Move(connection, identity, room);
        }
    }

    private RoomJoin Move(string connection, WorldIdentity identity, Room room)
    {
        var departures = new List<RoomDeparture>();
        WorldPose? previousPose = room.Members.GetValueOrDefault(identity.CharacterId)?.Pose;
        if (characterConnections.TryGetValue(identity.CharacterId, out var oldConnection))
        {
            var departure = Remove(oldConnection); if (departure is not null) departures.Add(departure);
        }
        if (membership.ContainsKey(connection))
        {
            var departure = Remove(connection); if (departure is not null) departures.Add(departure);
        }
        room.Members[identity.CharacterId] = new Member(connection, identity) { Pose = previousPose };
        membership[connection] = room.Code; characterConnections[identity.CharacterId] = connection;
        room.LastUsed = clock.GetUtcNow();
        return new RoomJoin(new RoomSnapshot(room.Code, identity.CharacterId, Roster(room).Players, room.Messages.ToArray()), departures.ToArray());
    }

    public RoomDeparture? Leave(string connection) { lock (gate) { return Remove(connection); } }
    private RoomDeparture? Remove(string connection)
    {
        if (!membership.Remove(connection, out var code) || !rooms.TryGetValue(code, out var room)) return null;
        var member = room.Members.Values.FirstOrDefault(member => member.Connection == connection);
        if (member is null) return null;
        room.Members.Remove(member.Identity.CharacterId);
        if (characterConnections.GetValueOrDefault(member.Identity.CharacterId) == connection) characterConnections.Remove(member.Identity.CharacterId);
        room.LastUsed = clock.GetUtcNow();
        return new RoomDeparture(connection, Roster(room));
    }

    public (string Code, WorldMessage Message, bool IsNew) Send(string connection, Guid clientMessageId, string? text)
    {
        lock (gate)
        {
            var (room, member) = MemberOf(connection);
            if (clientMessageId == Guid.Empty) throw new HubException("Message identifier is required.");
            var existing = room.Messages.FirstOrDefault(message => message.SenderId == member.Identity.CharacterId && message.ClientMessageId == clientMessageId);
            if (existing is not null) return (room.Code, existing, false);
            var safe = text?.Trim();
            if (string.IsNullOrEmpty(safe) || safe.Length > 280 || safe.Any(character => char.IsControl(character) && character != '\n'))
                throw new HubException("Write a message of 1–280 characters.");
            Limit(member.Identity.CharacterId, "chat", 5, TimeSpan.FromSeconds(10));
            var message = new WorldMessage(Guid.NewGuid(), member.Identity.CharacterId, member.Identity.Name, safe, ++room.Sequence, clock.GetUtcNow(), clientMessageId);
            room.Messages.Add(message); if (room.Messages.Count > 64) room.Messages.RemoveAt(0);
            room.LastUsed = clock.GetUtcNow();
            return (room.Code, message, true);
        }
    }

    public (string Code, WorldPlayer Player)? Publish(string connection, WorldPose? pose)
    {
        lock (gate)
        {
            var (room, member) = MemberOf(connection);
            if (pose is null || !double.IsFinite(pose.X) || !double.IsFinite(pose.Z) || !double.IsFinite(pose.Rotation) || !double.IsFinite(pose.Speed)
                || Math.Abs(pose.X) > 4096 || Math.Abs(pose.Z) > 4096 || Math.Abs(pose.Rotation) > 1_000_000 || pose.Speed < 0 || pose.Speed > 35
                || pose.Location is not ("street" or "home" or "school" or "city") || pose.Mode is not ("walking" or "driving" or "busy")
                || pose.Body is not ("male" or "female"))
                throw new HubException("Invalid player position.");
            var now = clock.GetUtcNow();
            if (now - member.LastPose < TimeSpan.FromMilliseconds(90)) return null;
            member.LastPose = now; member.Pose = pose with { Rotation = Math.IEEERemainder(pose.Rotation, Math.Tau) }; room.LastUsed = now;
            return (room.Code, new WorldPlayer(member.Identity.CharacterId, member.Identity.Name, member.Pose));
        }
    }

    private (Room, Member) MemberOf(string connection)
    {
        if (!membership.TryGetValue(connection, out var code) || !rooms.TryGetValue(code, out var room)) throw new HubException("Join a room first.");
        var member = room.Members.Values.FirstOrDefault(member => member.Connection == connection);
        return member is null ? throw new HubException("This session moved to another device.") : (room, member);
    }
    private static RoomRoster Roster(Room room) => new(room.Code, room.Members.Values.Select(member => new WorldPlayer(member.Identity.CharacterId, member.Identity.Name, member.Pose)).ToArray());
    private void Cleanup()
    {
        var now = clock.GetUtcNow();
        foreach (var room in rooms.Values.Where(room => room.Members.Count == 0 && now - room.LastUsed > TimeSpan.FromMinutes(2)).ToArray()) rooms.Remove(room.Code);
        foreach (var key in budgets.Where(item => item.Value.Count == 0 || now - item.Value.Last() > TimeSpan.FromMinutes(2)).Select(item => item.Key).ToArray()) budgets.Remove(key);
    }
    private void Limit(Guid character, string category, int limit, TimeSpan window)
    {
        var key = (character, category); var now = clock.GetUtcNow();
        if (!budgets.TryGetValue(key, out var queue))
        {
            if (budgets.Count >= 2048) { Cleanup(); if (budgets.Count >= 2048) throw new HubException("Server busy. Try again shortly."); }
            budgets[key] = queue = new Queue<DateTimeOffset>();
        }
        while (queue.TryPeek(out var time) && now - time >= window) queue.Dequeue();
        if (queue.Count >= limit) throw new HubException("Too fast. Please wait before trying again.");
        queue.Enqueue(now);
    }
}
