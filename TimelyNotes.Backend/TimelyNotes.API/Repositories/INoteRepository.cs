using TimelyNotes.API.Models;

namespace TimelyNotes.API.Repositories;

public interface INoteRepository
{
    /// <summary>
    /// Returns the notes belonging to the given Schedule whose <see cref="Note.OccursAt"/> falls in
    /// the range, newest first.
    /// </summary>
    /// <remarks>
    /// The range is <b>half-open</b>: <paramref name="searchFrom"/> is inclusive and
    /// <paramref name="searchTo"/> is exclusive, so a note at exactly <paramref name="searchTo"/>
    /// belongs to the next window. Callers page through the timeline with adjacent windows and must
    /// never see the same note twice — an implementation that closes the upper bound breaks that.
    /// Comparison is instant-to-instant; the caller's offsets carry the timezone.
    /// Filtering is a query concern and lives here so a real store can push it into the database.
    /// </remarks>
    Task<IReadOnlyList<Note>> GetBySchedule(
        string scheduleShortName,
        DateTimeOffset searchFrom,
        DateTimeOffset searchTo,
        CancellationToken ct);
}
