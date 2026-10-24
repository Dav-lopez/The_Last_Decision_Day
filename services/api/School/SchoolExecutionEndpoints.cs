using System.Data;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TheLastDecision.Api.Characters;
using TheLastDecision.Api.Identity;

namespace TheLastDecision.Api.School;

public sealed record SchoolExecutionResult(string ActivityId, int TimeCost,
    IReadOnlyDictionary<string, int> Before, IReadOnlyDictionary<string, int> After, Guid CorrelationId);

public static class SchoolExecutionEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void MapSchoolExecutionEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/school/activities/{activityId}/execute", Execute)
            .RequireAuthorization()
            .AddEndpointFilter(IdentityEndpoints.ValidateCsrf)
            .RequireRateLimiting("school");
    }

    private static async Task<IResult> Execute(string activityId, HttpContext context,
        ClaimsPrincipal principal, GameDbContext db, AttributeService attributeService,
        CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return Results.Unauthorized();

        // A client-generated UUID is stable across retries, but different for each intended action.
        if (!Guid.TryParse(context.Request.Headers["Idempotency-Key"].ToString(), out var requestId) ||
            requestId == Guid.Empty)
            return Results.BadRequest(new { error = "Provide an Idempotency-Key UUID for this action." });

        var activity = SchoolActivities.Catalog.FirstOrDefault(a => a.Id == activityId);
        if (activity is null)
            return Results.NotFound(new { error = "Unknown school activity." });

        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var character = await db.Characters.AsNoTracking()
                .SingleOrDefaultAsync(x => x.UserId == userId, ct);
            if (character is null) return Results.NotFound(new { error = "Create a character first." });

            var scope = "school:" + character.Id.ToString("N");
            var key = requestId.ToString("N");
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(activityId)));
            var previous = await db.IdempotencyRecords.AsNoTracking()
                .SingleOrDefaultAsync(x => x.Scope == scope && x.Key == key, ct);
            if (previous is not null)
            {
                if (previous.RequestHash != hash)
                    return Results.Conflict(new { error = "Idempotency key was used for a different activity." });
                if (string.IsNullOrEmpty(previous.ResponseJson))
                    return Results.Conflict(new { error = "Action response is not available." });
                return Results.Content(previous.ResponseJson, "application/json", Encoding.UTF8);
            }

            // Check time after idempotent replay so a successful retry remains valid
            // even when the player's daily budget is exhausted.
            var now = DateTimeOffset.UtcNow;
            SchoolTimeBalance balance;
            try { balance = await SchoolTimeBudget.LoadAsync(db, character.Id, now, ct); }
            catch (InvalidDataException)
            {
                return Results.Conflict(new { error = "Saved school time could not be verified." });
            }
            if (!SchoolTimeBudget.CanExecute(balance, activity))
                return Results.Conflict(new { error = "Not enough school time remaining today. Try again after the UTC reset." });

            var current = await db.CharacterAttributes.AsNoTracking()
                .Where(x => x.CharacterId == character.Id)
                .ToDictionaryAsync(x => x.Name, x => x.Value, ct);
            ActivityPreview preview;
            try { preview = SchoolActivities.Preview(activityId, current); }
            catch (ArgumentException)
            {
                return Results.Conflict(new { error = "Character attributes are invalid." });
            }

            // Attribute values and audit events commit atomically with the idempotency record.
            // Serializable isolation prevents lost updates when multiple requests race.
            var correlationId = Guid.NewGuid();
            await attributeService.ApplyAsync(character.Id, preview.After,
                "school:" + activityId, correlationId, ct);
            var response = new SchoolExecutionResult(activityId, preview.TimeCost,
                preview.Before, preview.After, correlationId);
            // The completed action and its attribute events commit in the same transaction.
            // The idempotency record below is only for replay protection.
            db.SchoolActivityExecutions.Add(new SchoolActivityExecution
            {
                CharacterId = character.Id,
                ActivityId = activityId,
                TimeCost = response.TimeCost,
                CorrelationId = correlationId,
                CreatedAt = now,
                BeforeJson = JsonSerializer.Serialize(response.Before, JsonOptions),
                AfterJson = JsonSerializer.Serialize(response.After, JsonOptions)
            });
            db.IdempotencyRecords.Add(new IdempotencyRecord
            {
                Scope = scope,
                Key = key,
                RequestHash = hash,
                CorrelationId = correlationId,
                CreatedAt = now,
                ResponseJson = JsonSerializer.Serialize(response, JsonOptions)
            });
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Ok(response);
        }
        catch (PostgresException e) when (e.SqlState is "40001" or "23505")
        {
            return Results.Conflict(new { error = "Concurrent update; retry with the same Idempotency-Key." });
        }
        catch (DbUpdateException e) when (e.InnerException is PostgresException p &&
            p.SqlState is "40001" or "23505")
        {
            return Results.Conflict(new { error = "Concurrent update; retry with the same Idempotency-Key." });
        }
    }
}
