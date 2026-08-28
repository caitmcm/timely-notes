using TimelyNotes.API.Models;

namespace TimelyNotes.API.Repositories;

public interface INoteRepository
{
    /// <summary>
    /// Notes in the Schedule whose <see cref="Note.OccursAt"/> falls in the half-open range
    /// <c>[searchFrom, searchTo)</c>, newest first, so adjacent windows never repeat a note.
    /// </summary>
    Task<IReadOnlyList<Note>> GetBySchedule(
        string scheduleShortName,
        DateTimeOffset searchFrom,
        DateTimeOffset searchTo,
        CancellationToken ct);
}
