using Microsoft.EntityFrameworkCore;
using Npgsql;
using TimelyNotes.API.Data;
using TimelyNotes.API.Models;

namespace TimelyNotes.API.Repositories;

/// <summary>
/// The persistent store. Every method opens its own context from the factory and issues one
/// statement, so a repository method is the transaction boundary — nothing composes two.
/// </summary>
public class PostgresNoteRepository(IDbContextFactory<NotesDbContext> contexts) : INoteRepository
{
    /// <summary>
    /// One round trip, and no read-then-write: two callers racing on the same period would
    /// otherwise both see nothing and both insert. <c>DO UPDATE</c> leaves <c>created_at</c>
    /// alone, and <c>xmax = 0</c> is true only on the insert path, which is what tells
    /// <c>201</c> from <c>200</c> without a second query.
    /// </summary>
    internal const string UpsertSql = """
        INSERT INTO notes (schedule_span_hours, day, period_ordinal, content, created_at, modified_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (schedule_span_hours, day, period_ordinal) DO UPDATE
            SET content = EXCLUDED.content, modified_at = EXCLUDED.modified_at
        RETURNING content, created_at, modified_at, (xmax = 0) AS created
        """;

    /// <inheritdoc />
    public async Task<IReadOnlyList<Note>> GetBySchedule(
        int scheduleSpanHours,
        DateOnly searchFrom,
        DateOnly searchTo,
        CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);

        return await NoteQueries
            .Notes(db, scheduleSpanHours, searchFrom, searchTo)
            .ToListAsync(ct);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<NoteDayCount>> GetDayCountsBySchedule(
        int scheduleSpanHours,
        DateOnly searchFrom,
        DateOnly searchTo,
        CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);

        return await NoteQueries
            .DayCounts(db, scheduleSpanHours, searchFrom, searchTo)
            .ToListAsync(ct);
    }

    /// <inheritdoc />
    public async Task<UpsertResult> Upsert(Note note, CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);
        await using var command = new NpgsqlCommand(UpsertSql)
        {
            Parameters =
            {
                new NpgsqlParameter { Value = note.ScheduleSpanHours },
                new NpgsqlParameter { Value = note.Day },
                new NpgsqlParameter { Value = note.PeriodOrdinal },
                new NpgsqlParameter { Value = NoteContent.Normalise(note.Content) },
                new NpgsqlParameter { Value = note.CreatedAt },
                new NpgsqlParameter { Value = note.ModifiedAt }
            }
        };

        command.Connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(ct);

        await using var row = await command.ExecuteReaderAsync(ct);
        await row.ReadAsync(ct);

        var written = new Note
        {
            ScheduleSpanHours = note.ScheduleSpanHours,
            Day = note.Day,
            PeriodOrdinal = note.PeriodOrdinal,
            Content = row.GetString(0),
            CreatedAt = row.GetFieldValue<DateTimeOffset>(1),
            ModifiedAt = row.GetFieldValue<DateTimeOffset>(2)
        };

        return new UpsertResult(written, row.GetBoolean(3));
    }

    /// <inheritdoc />
    public async Task<bool> Delete(
        int scheduleSpanHours,
        DateOnly day,
        int periodOrdinal,
        CancellationToken ct)
    {
        await using var db = await contexts.CreateDbContextAsync(ct);

        var deleted = await db.Notes
            .Where(note =>
                note.ScheduleSpanHours == scheduleSpanHours
                && note.Day == day
                && note.PeriodOrdinal == periodOrdinal)
            .ExecuteDeleteAsync(ct);

        return deleted > 0;
    }
}
