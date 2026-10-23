using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TheLastDecision.Api.Infrastructure.Persistence.Migrations
{
    /// <summary>Forward-only additive audit and ledger hardening; InitialCreate remains immutable.</summary>
    public partial class AddAuditFoundation : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_WalletTransactions_IdempotencyKey", table: "WalletTransactions");
            migrationBuilder.DropIndex(name: "IX_WalletTransactions_WalletId", table: "WalletTransactions");

            migrationBuilder.AlterColumn<string>(
                name: "DisplayName", table: "Characters", type: "character varying(32)",
                maxLength: 32, nullable: false, oldClrType: typeof(string), oldType: "text");

            migrationBuilder.AddColumn<Guid>(
                name: "CorrelationId", table: "WalletTransactions",
                type: "uuid", nullable: false, defaultValue: Guid.Empty);
            migrationBuilder.AddColumn<string>(
                name: "Reason", table: "WalletTransactions",
                type: "character varying(64)", maxLength: 64, nullable: false,
                defaultValue: "legacy_import");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Character_DisplayName_Length", table: "Characters",
                sql: "char_length(\"DisplayName\") BETWEEN 2 AND 32");
            migrationBuilder.AddCheckConstraint(
                name: "CK_Wallet_Nonnegative_Balance", table: "Wallets",
                sql: "\"Balance\" >= 0");

            migrationBuilder.CreateTable(
                name: "AttributeEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CharacterId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    BeforeValue = table.Column<int>(type: "integer", nullable: true),
                    AfterValue = table.Column<int>(type: "integer", nullable: false),
                    Reason = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AttributeEvents", x => x.Id);
                    table.CheckConstraint("CK_AttributeEvent_After_Range", "\"AfterValue\" BETWEEN 0 AND 100");
                    table.CheckConstraint("CK_AttributeEvent_Before_Range", "\"BeforeValue\" IS NULL OR \"BeforeValue\" BETWEEN 0 AND 100");
                    table.ForeignKey(
                        name: "FK_AttributeEvents_Characters_CharacterId",
                        column: x => x.CharacterId, principalTable: "Characters",
                        principalColumn: "Id", onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "IdempotencyRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Scope = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Key = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ResponseJson = table.Column<string>(type: "text", nullable: true),
                    CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table => { table.PrimaryKey("PK_IdempotencyRecords", x => x.Id); });

            migrationBuilder.CreateIndex(
                name: "IX_AttributeEvents_CharacterId_CreatedAt", table: "AttributeEvents",
                columns: new[] { "CharacterId", "CreatedAt" });
            migrationBuilder.CreateIndex(
                name: "IX_AttributeEvents_CorrelationId", table: "AttributeEvents",
                column: "CorrelationId");
            migrationBuilder.CreateIndex(
                name: "IX_IdempotencyRecords_Scope_Key", table: "IdempotencyRecords",
                columns: new[] { "Scope", "Key" }, unique: true);
            migrationBuilder.CreateIndex(
                name: "IX_WalletTransactions_CorrelationId", table: "WalletTransactions",
                column: "CorrelationId");
            migrationBuilder.CreateIndex(
                name: "IX_WalletTransactions_WalletId_IdempotencyKey", table: "WalletTransactions",
                columns: new[] { "WalletId", "IdempotencyKey" }, unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "AttributeEvents");
            migrationBuilder.DropTable(name: "IdempotencyRecords");
            migrationBuilder.DropIndex(name: "IX_WalletTransactions_CorrelationId", table: "WalletTransactions");
            migrationBuilder.DropIndex(name: "IX_WalletTransactions_WalletId_IdempotencyKey", table: "WalletTransactions");
            migrationBuilder.DropCheckConstraint(name: "CK_Character_DisplayName_Length", table: "Characters");
            migrationBuilder.DropCheckConstraint(name: "CK_Wallet_Nonnegative_Balance", table: "Wallets");
            migrationBuilder.DropColumn(name: "CorrelationId", table: "WalletTransactions");
            migrationBuilder.DropColumn(name: "Reason", table: "WalletTransactions");
            migrationBuilder.AlterColumn<string>(
                name: "DisplayName", table: "Characters", type: "text", nullable: false,
                oldClrType: typeof(string), oldType: "character varying(32)", oldMaxLength: 32);
            migrationBuilder.CreateIndex(
                name: "IX_WalletTransactions_IdempotencyKey", table: "WalletTransactions",
                column: "IdempotencyKey", unique: true);
            migrationBuilder.CreateIndex(
                name: "IX_WalletTransactions_WalletId", table: "WalletTransactions",
                column: "WalletId");
        }
    }
}
