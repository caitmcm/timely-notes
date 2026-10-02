using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TimelyNotes.API.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUsers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "pk_notes",
                table: "notes");

            migrationBuilder.AddColumn<Guid>(
                name: "user_id",
                table: "notes",
                type: "uuid",
                nullable: false);

            migrationBuilder.AddPrimaryKey(
                name: "pk_notes",
                table: "notes",
                columns: new[] { "user_id", "schedule_span_hours", "day", "period_ordinal" });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    issuer = table.Column<string>(type: "text", nullable: false),
                    subject = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.id);
                    table.UniqueConstraint("ak_users_issuer_subject", x => new { x.issuer, x.subject });
                });

            migrationBuilder.AddForeignKey(
                name: "fk_notes_users_user_id",
                table: "notes",
                column: "user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_notes_users_user_id",
                table: "notes");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropPrimaryKey(
                name: "pk_notes",
                table: "notes");

            migrationBuilder.DropColumn(
                name: "user_id",
                table: "notes");

            migrationBuilder.AddPrimaryKey(
                name: "pk_notes",
                table: "notes",
                columns: new[] { "schedule_span_hours", "day", "period_ordinal" });
        }
    }
}
