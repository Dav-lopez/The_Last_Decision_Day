using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TheLastDecision.Api;

#nullable disable

namespace TheLastDecision.Api.Infrastructure.Persistence.Migrations;

/// <summary>
/// Database-enforced append-only audit history. No entity-model change is required:
/// this migration installs a PostgreSQL trigger and intentionally leaves the
/// generated EF model snapshot unchanged.
/// </summary>
[DbContext(typeof(GameDbContext))]
[Migration("20261024212200_AppendOnlyAttributeEvents")]
public partial class AppendOnlyAttributeEvents : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE FUNCTION tld_reject_attribute_event_mutation()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RAISE EXCEPTION 'AttributeEvents is append-only'
                    USING ERRCODE = '23514';
            END;
            $$;

            CREATE TRIGGER trg_attribute_events_append_only
            BEFORE UPDATE OR DELETE ON "AttributeEvents"
            FOR EACH ROW
            EXECUTE FUNCTION tld_reject_attribute_event_mutation();
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TRIGGER IF EXISTS trg_attribute_events_append_only ON "AttributeEvents";
            DROP FUNCTION IF EXISTS tld_reject_attribute_event_mutation();
            """);
    }
}
