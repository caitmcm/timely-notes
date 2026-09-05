using TimelyNotes.API.Models;

namespace TimelyNotes.API.Repositories;

/// <summary>
/// Dev-only store, seeded across today ± 3 days. "Today" is frozen when the singleton is built, so
/// a server left running overnight renders an empty day that looks like a frontend bug — restart it.
/// </summary>
public class InMemoryNoteRepository : INoteRepository
{
    private readonly List<Note> _notes;

    public InMemoryNoteRepository() => _notes = [.. SeedNotes()];

    /// <inheritdoc />
    public Task<IReadOnlyList<Note>> GetBySchedule(
        int scheduleSpanHours,
        DateOnly searchFrom,
        DateOnly searchTo,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        IReadOnlyList<Note> notes =
        [
            .. _notes
                .Where(note => note.ScheduleSpanHours == scheduleSpanHours)
                .Where(note => note.Day >= searchFrom && note.Day < searchTo)
                .OrderByDescending(note => note.Day)
                .ThenByDescending(note => note.PeriodOrdinal)
        ];

        return Task.FromResult(notes);
    }

    /// <inheritdoc />
    public Task<IReadOnlyList<NoteDayCount>> GetDayCountsBySchedule(
        int scheduleSpanHours,
        DateOnly searchFrom,
        DateOnly searchTo,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        IReadOnlyList<NoteDayCount> counts =
        [
            .. _notes
                .Where(note => note.ScheduleSpanHours == scheduleSpanHours)
                .Where(note => note.Day >= searchFrom && note.Day < searchTo)
                .GroupBy(note => note.Day)
                .Select(day => new NoteDayCount(day.Key, day.Count()))
                .OrderBy(count => count.Day)
        ];

        return Task.FromResult(counts);
    }

    private static IEnumerable<Note> SeedNotes()
    {
        yield return Seed(1, -3, 11, "Kick-off: sketched the domain model.");
        yield return Seed(1, -1, 12, "Pairing on the repository abstraction.");
        yield return Seed(1, 0, 10, "# Stand-up\n\nBlocked on the notes endpoint.");
        yield return Seed(1, 0, 15, "## Afternoon\n\n- Review the design doc\n- Sketch the schedule view");
        yield return Seed(1, 1, 10, "Planned: walk the date-range endpoint.");
        yield return Seed(1, 3, 17, "Retro prep.");

        yield return Seed(3, -2, 6, "Spiked the editor — MDXEditor looks right.");
        yield return Seed(3, 0, 4, "Morning block: drafted the TDD plan.");
        yield return Seed(3, 0, 6, "Afternoon block: wired up FastEndpoints.");
        yield return Seed(3, 1, 5, "Next up: the scrolling schedule.");

        yield return Seed(6, -3, 4, "Weekend reading on half-open ranges.");
        yield return Seed(6, 0, 2, "First half of the day, in one go.");
        yield return Seed(6, 0, 4, "Evening wrap-up: slice one is close.");
        yield return Seed(6, 2, 2, "Ahead of time: prep the create endpoint.");
    }

    /// <summary>Stamps the audit fields at construction time, so they differ from the note's day.</summary>
    private static Note Seed(int scheduleSpanHours, int dayOffset, int periodOrdinal, string content)
    {
        var writtenAt = DateTimeOffset.Now;

        return new Note
        {
            ScheduleSpanHours = scheduleSpanHours,
            Day = DateOnly.FromDateTime(DateTime.Today).AddDays(dayOffset),
            PeriodOrdinal = periodOrdinal,
            Content = content,
            CreatedAt = writtenAt,
            ModifiedAt = writtenAt
        };
    }
}
