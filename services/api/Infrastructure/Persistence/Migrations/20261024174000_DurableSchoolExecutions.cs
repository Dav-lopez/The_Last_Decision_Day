using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TheLastDecision.Api.Infrastructure.Persistence.Migrations
{
    /// <summary>Separates completed school actions from retry-key storage.</summary>
    public partial class DurableSchoolExecutions : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SchoolActivityExecutions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CharacterId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActivityId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TimeCost = table.Column<int>(type: "integer", nullable: false),
                    CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    BeforeJson = table.Column<string>(type: "text", nullable: false),
                    AfterJson = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SchoolActivityExecutions", x => x.Id);
                    table.CheckConstraint("CK_SchoolExecution_ValidCharge", "\"TimeCost\" BETWEEN 1 AND 8");
                    table.CheckConstraint("CK_SchoolExecution_ActivityId", "char_length(\"ActivityId\") BETWEEN 1 AND 64");
                    table.ForeignKey(
                        name: "FK_SchoolActivityExecutions_Characters_CharacterId",
                        column: x => x.CharacterId,
                        principalTable: "Characters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SchoolActivityExecutions_CharacterId_CreatedAt_Id",
                table: "SchoolActivityExecutions",
                columns: new[] { "CharacterId", "CreatedAt", "Id" },
                descending: new[] { false, true, true });

            migrationBuilder.CreateIndex(
                name: "IX_SchoolActivityExecutions_CorrelationId",
                table: "SchoolActivityExecutions",
                column: "CorrelationId",
                unique: true);

            // Strict, lossless backfill. Invalid historical JSON, mismatched correlation
            // IDs, invalid charges or missing characters abort the migration instead
            // of silently dropping actions or granting players free time.
            migrationBuilder.Sql("""
                INSERT INTO "SchoolActivityExecutions"
                    ("Id", "CharacterId", "ActivityId", "TimeCost", "CorrelationId",
                     "CreatedAt", "BeforeJson", "AfterJson")
                SELECT
                    gen_random_uuid(),
                    substring(r."Scope" from 8)::uuid,
                    p.payload ->> 'activityId',
                    (p.payload ->> 'timeCost')::integer,
                    CASE WHEN (p.payload ->> 'correlationId')::uuid = r."CorrelationId"
                         THEN r."CorrelationId" ELSE NULL END,
                    r."CreatedAt",
                    CASE WHEN jsonb_typeof(p.payload -> 'before') = 'object'
                         THEN (p.payload -> 'before')::text ELSE NULL END,
                    CASE WHEN jsonb_typeof(p.payload -> 'after') = 'object'
                         THEN (p.payload -> 'after')::text ELSE NULL END
                FROM "IdempotencyRecords" r
                CROSS JOIN LATERAL (SELECT r."ResponseJson"::jsonb AS payload) p
                WHERE r."Scope" LIKE 'school:%';
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "SchoolActivityExecutions");
        }
    }
}
