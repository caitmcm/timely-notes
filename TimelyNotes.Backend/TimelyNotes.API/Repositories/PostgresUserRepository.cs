using Microsoft.EntityFrameworkCore;
using Npgsql;
using TimelyNotes.API.Data;

namespace TimelyNotes.API.Repositories;

/// <summary>Select, insert if absent, select again: a racing first request finds the winner's row.</summary>
public class PostgresUserRepository(IDbContextFactory<NotesDbContext> contexts, TimeProvider clock)
    : IUserRepository
{
    internal const string SelectSql = "SELECT id FROM users WHERE issuer = $1 AND subject = $2";

    internal const string InsertSql = """
        INSERT INTO users (id, issuer, subject, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (issuer, subject) DO NOTHING
        """;

    /// <inheritdoc />
    public async Task<Guid> Resolve(string issuer, string subject, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(ct);

        if (await Select(connection, issuer, subject, ct) is { } existing)
        {
            return existing;
        }

        await using (var insert = new NpgsqlCommand(InsertSql, connection)
        {
            Parameters =
            {
                new NpgsqlParameter { Value = Guid.CreateVersion7() },
                new NpgsqlParameter { Value = issuer },
                new NpgsqlParameter { Value = subject },
                new NpgsqlParameter { Value = clock.GetUtcNow() }
            }
        })
        {
            await insert.ExecuteNonQueryAsync(ct);
        }

        return await Select(connection, issuer, subject, ct)
            ?? throw new InvalidOperationException($"No user row for {issuer} {subject} after insert.");
    }

    private static async Task<Guid?> Select(
        NpgsqlConnection connection, string issuer, string subject, CancellationToken ct)
    {
        await using var select = new NpgsqlCommand(SelectSql, connection)
        {
            Parameters =
            {
                new NpgsqlParameter { Value = issuer },
                new NpgsqlParameter { Value = subject }
            }
        };

        return await select.ExecuteScalarAsync(ct) is Guid id ? id : null;
    }
}
