using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TheLastDecision.Api.Infrastructure.Persistence.Migrations
{
    /// <summary>Supports per-character daily school budget and newest-first history queries.</summary>
    public partial class SchoolActivityReadIndex : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_IdempotencyRecords_Scope_CreatedAt_Id",
                table: "IdempotencyRecords",
                columns: new[] { "Scope", "CreatedAt", "Id" },
                descending: new[] { false, true, true });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_IdempotencyRecords_Scope_CreatedAt_Id",
                table: "IdempotencyRecords");
        }
    }
}
