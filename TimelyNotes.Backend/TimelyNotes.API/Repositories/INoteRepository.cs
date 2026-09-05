using TimelyNotes.API.Models;

namespace TimelyNotes.API.Repositories;

public interface INoteRepository
{
    /// <summary>
    /// Notes in the Schedule whose <see cref="Note.Day"/> falls in the half-open range
    /// <c>[searchFrom, searchTo)</c>, newest first by <c>(Day, PeriodOrdinal)</c>, so adjacent
    /// windows never repeat a note.
    /// </summary>
    Task<IReadOnlyList<Note>> GetBySchedule(
        int scheduleSpanHours,
        DateOnly searchFrom,
        DateOnly searchTo,
        CancellationToken ct);

    /// <summary>
    /// Notes per day over the same half-open range, ascending, days with none omitted.
    /// </summary>
    Task<IReadOnlyList<NoteDayCount>> GetDayCountsBySchedule(
        int scheduleSpanHours,
        DateOnly searchFrom,
        DateOnly searchTo,
        CancellationToken ct);
}
