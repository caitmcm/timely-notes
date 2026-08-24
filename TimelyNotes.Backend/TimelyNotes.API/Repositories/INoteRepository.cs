using TimelyNotes.API.Models;

namespace TimelyNotes.API.Repositories;

public interface INoteRepository
{
    /// <summary>Returns every note belonging to the given Schedule, newest first.</summary>
    Task<IReadOnlyList<Note>> GetBySchedule(string scheduleShortName, CancellationToken ct);
}
