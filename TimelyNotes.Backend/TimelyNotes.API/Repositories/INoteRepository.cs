using TimelyNotes.API.Models;

namespace TimelyNotes.API.Repositories;

public interface INoteRepository
{
    /// <summary>
    /// Notes in the Schedule whose <see cref="Note.Day"/> falls in the half-open range
    /// <c>[searchFrom, searchTo)</c>, newest first by <c>(Day, PeriodOrdinal)</c>, so adjacent
    /// windows never repeat a note. A note with no content is retained but never returned: the
    /// client's delete-on-close is best-effort, and this is what keeps a stray one invisible.
    /// </summary>
    Task<IReadOnlyList<Note>> GetBySchedule(
        int scheduleSpanHours,
        DateOnly searchFrom,
        DateOnly searchTo,
        CancellationToken ct);

    /// <summary>
    /// Notes per day over the same half-open range, ascending, days with none omitted. Empty notes
    /// are omitted here too, so a marker can never point at a day that renders blank.
    /// </summary>
    Task<IReadOnlyList<NoteDayCount>> GetDayCountsBySchedule(
        int scheduleSpanHours,
        DateOnly searchFrom,
        DateOnly searchTo,
        CancellationToken ct);

    /// <summary>
    /// Writes <paramref name="note"/> to the period it addresses, creating it if that period holds
    /// nothing. The caller supplies a fully-stamped note; <see cref="Note.CreatedAt"/> is honoured
    /// only on the create path. Replacement is last-write-wins by design, and repeating the same
    /// call is a no-op — which is what makes a retry and a double-invoked effect both harmless.
    /// </summary>
    Task<UpsertResult> Upsert(Note note, CancellationToken ct);

    /// <summary>
    /// Removes the note in that period, empty or not. <c>false</c> when it held nothing.
    /// </summary>
    Task<bool> Delete(
        int scheduleSpanHours,
        DateOnly day,
        int periodOrdinal,
        CancellationToken ct);
}
