using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TheLastDecision.Api;

#nullable disable

namespace TheLastDecision.Api.Infrastructure.Persistence.Migrations;

/// <summary>Saves each character's story, career and neighbour relationships as one JSON document.</summary>
[DbContext(typeof(GameDbContext))]
[Migration("20261031160000_AddCharacterProgress")]
public partial class AddCharacterProgress : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "CharacterProgress",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                CharacterId = table.Column<Guid>(type: "uuid", nullable: false),
                SavedAt = table.Column<long>(type: "bigint", nullable: false),
                DataJson = table.Column<string>(type: "jsonb", nullable: false),
                UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_CharacterProgress", x => x.Id);
                table.ForeignKey(
                    name: "FK_CharacterProgress_Characters_CharacterId",
                    column: x => x.CharacterId,
                    principalTable: "Characters",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_CharacterProgress_CharacterId",
            table: "CharacterProgress",
            column: "CharacterId",
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "CharacterProgress");
    }
}
