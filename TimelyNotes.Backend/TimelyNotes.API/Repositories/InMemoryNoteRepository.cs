using TimelyNotes.API.Models;

namespace TimelyNotes.API.Repositories;

/// <summary>
/// Placeholder store holding notes in memory, seeded with example data. Registered as a singleton
/// so the seeded state survives across requests.
/// </summary>
public class InMemoryNoteRepository : INoteRepository
{
    private readonly List<Note> _notes;

    public InMemoryNoteRepository() => _notes = [.. SeedNotes()];

    public Task<IReadOnlyList<Note>> GetBySchedule(string scheduleShortName, CancellationToken ct)
    {
        IReadOnlyList<Note> notes =
        [
            .. _notes
                .Where(note => note.ScheduleShortName == scheduleShortName)
                .OrderByDescending(note => note.CreatedAt)
        ];

        return Task.FromResult(notes);
    }

    private static IEnumerable<Note> SeedNotes()
    {
        var day = new DateTimeOffset(2026, 8, 24, 0, 0, 0, TimeSpan.Zero);

        yield return Seed("s1", day.AddHours(9), "# Stand-up\n\nBlocked on the notes endpoint.");
        yield return Seed("s1", day.AddHours(11), "Pairing on the repository abstraction.");
        yield return Seed("s1", day.AddHours(14), "## Afternoon\n\n- Review the design doc\n- Sketch the schedule view");
        yield return Seed("s3", day.AddHours(9), "Morning block: drafted the TDD plan.");
        yield return Seed("s3", day.AddHours(15), "Afternoon block: wired up FastEndpoints.");
        yield return Seed("s6", day.AddHours(6), "First half of the day, in one go.");
        yield return Seed("s6", day.AddHours(18), "Evening wrap-up: slice one is close.");
    }

    private static Note Seed(string scheduleShortName, DateTimeOffset createdAt, string content) => new()
    {
        Id = Guid.NewGuid(),
        ScheduleShortName = scheduleShortName,
        Content = content,
        CreatedAt = createdAt,
        ModifiedAt = createdAt
    };
}
