using System.Collections.ObjectModel;
using Microsoft.EntityFrameworkCore;

namespace TheLastDecision.Api.Characters;

/// <summary>
/// Single write path for character attributes. Callers save the tracked rows and
/// audit events together in one DbContext transaction; never save attributes alone.
/// </summary>
public sealed class AttributeService(GameDbContext db)
{
    public static IReadOnlyDictionary<string, int> StarterValues { get; } =
        new ReadOnlyDictionary<string, int>(new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["Intelligence"] = 25,
            ["Discipline"] = 25,
            ["Stress"] = 0,
            ["Reputation"] = 25
        });

    public IReadOnlyDictionary<string, int> Initialize(Guid characterId, Guid correlationId)
    {
        ValidateMetadata("character_created", correlationId);
        if (characterId == Guid.Empty) throw new ArgumentException("Character ID is required.", nameof(characterId));
        foreach (var (name, value) in StarterValues)
        {
            db.CharacterAttributes.Add(new CharacterAttribute
            {
                CharacterId = characterId,
                Name = name,
                Value = value
            });
            Record(characterId, name, null, value, "character_created", correlationId);
        }
        return StarterValues;
    }

    /// <summary>
    /// Stage an audited change to existing attributes. The caller must use a
    /// transaction (and serialize concurrent changes) before saving the rows.
    /// </summary>
    public async Task ApplyAsync(Guid characterId, IReadOnlyDictionary<string, int> target,
        string reason, Guid correlationId, CancellationToken ct)
    {
        ValidateMetadata(reason, correlationId);
        ArgumentNullException.ThrowIfNull(target);
        if (target.Count != StarterValues.Count ||
            StarterValues.Keys.Any(name => !target.TryGetValue(name, out var value) || value is < 0 or > 100))
            throw new ArgumentException("Expected all four attributes in the range 0–100.", nameof(target));

        var rows = await db.CharacterAttributes.Where(x => x.CharacterId == characterId).ToListAsync(ct);
        if (rows.Count != StarterValues.Count || rows.Any(x => !StarterValues.ContainsKey(x.Name)))
            throw new InvalidOperationException("Character attributes are incomplete or invalid.");

        foreach (var row in rows)
        {
            var next = target[row.Name];
            if (next == row.Value) continue;
            Record(characterId, row.Name, row.Value, next, reason, correlationId);
            row.Value = next;
        }
    }

    private void Record(Guid characterId, string name, int? before, int after, string reason, Guid correlationId) =>
        db.AttributeEvents.Add(new AttributeEvent
        {
            CharacterId = characterId,
            Name = name,
            BeforeValue = before,
            AfterValue = after,
            Reason = reason,
            CorrelationId = correlationId
        });

    private static void ValidateMetadata(string reason, Guid correlationId)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Length > 64)
            throw new ArgumentException("A short audit reason is required.", nameof(reason));
        if (correlationId == Guid.Empty)
            throw new ArgumentException("A correlation ID is required.", nameof(correlationId));
    }
}
