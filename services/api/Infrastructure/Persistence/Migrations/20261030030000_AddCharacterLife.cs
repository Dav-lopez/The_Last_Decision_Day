using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TheLastDecision.Api;

#nullable disable

namespace TheLastDecision.Api.Infrastructure.Persistence.Migrations;

/// <summary>Saves each character's day: game clock, energy and location (street or home).</summary>
[DbContext(typeof(GameDbContext))]
[Migration("20261030030000_AddCharacterLife")]
public partial class AddCharacterLife : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "CharacterLives",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                CharacterId = table.Column<Guid>(type: "uuid", nullable: false),
                Day = table.Column<int>(type: "integer", nullable: false),
                Minute = table.Column<int>(type: "integer", nullable: false),
                Energy = table.Column<int>(type: "integer", nullable: false),
                Location = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_CharacterLives", x => x.Id);
                table.CheckConstraint("CK_CharacterLife_Day", "\"Day\" >= 1");
                table.CheckConstraint("CK_CharacterLife_Energy", "\"Energy\" BETWEEN 0 AND 100");
                table.CheckConstraint("CK_CharacterLife_Location", "\"Location\" IN ('street','home')");
                table.CheckConstraint("CK_CharacterLife_Minute", "\"Minute\" BETWEEN 0 AND 1439");
                table.ForeignKey(
                    name: "FK_CharacterLives_Characters_CharacterId",
                    column: x => x.CharacterId,
                    principalTable: "Characters",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_CharacterLives_CharacterId",
            table: "CharacterLives",
            column: "CharacterId",
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "CharacterLives");
    }
}
