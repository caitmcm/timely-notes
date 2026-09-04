using TimelyNotes.API.Models;

namespace TimelyNotes.API.Repositories;

/// <summary>
/// Dev-only store, seeded over local midnight today ± 3 days. "Today" is deliberately frozen when
/// the singleton is built: re-anchoring per request would mint fresh ids under an open dialog, for
/// a fixture that disappears once a real store lands. The UI's clock does advance across midnight,
/// so a server left running overnight renders an empty day that looks like a frontend bug —
/// restart it.
/// </summary>
public class InMemoryNoteRepository : INoteRepository
{
    private readonly List<Note> _notes;

    public InMemoryNoteRepository() => _notes = [.. SeedNotes()];

    /// <inheritdoc />
    public Task<IReadOnlyList<Note>> GetBySchedule(
        string scheduleShortName,
        DateTimeOffset searchFrom,
        DateTimeOffset searchTo,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        IReadOnlyList<Note> notes =
        [
            .. _notes
                .Where(note => note.ScheduleShortName == scheduleShortName)
                .Where(note => note.OccursAt >= searchFrom && note.OccursAt < searchTo)
                .OrderByDescending(note => note.OccursAt)
        ];

        return Task.FromResult(notes);
    }

    /// <inheritdoc />
    public Task<IReadOnlyList<NoteDayCount>> GetDayCountsBySchedule(
        string scheduleShortName,
        DateTimeOffset searchFrom,
        DateTimeOffset searchTo,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        var offset = searchFrom.Offset;

        IReadOnlyList<NoteDayCount> counts =
        [
            .. _notes
                .Where(note => note.ScheduleShortName == scheduleShortName)
                .Where(note => note.OccursAt >= searchFrom && note.OccursAt < searchTo)
                .GroupBy(note => note.OccursAt.ToOffset(offset).Date)
                .Select(day => new NoteDayCount(new DateTimeOffset(day.Key, offset), day.Count()))
                .OrderBy(count => count.Day)
        ];

        return Task.FromResult(counts);
    }

    private static IEnumerable<Note> SeedNotes()
    {
        var today = new DateTimeOffset(DateTime.Today, DateTimeOffset.Now.Offset);
        DateTimeOffset at(int dayOffset, double hour) => today.AddDays(dayOffset).AddHours(hour);

        yield return Seed("s1", at(-3, 10), "Kick-off: sketched the domain model.");
        yield return Seed("s1", at(-1, 11), "Pairing on the repository abstraction.");
        yield return Seed("s1", at(0, 9), "# Stand-up\n\nBlocked on the notes endpoint.");
        yield return Seed("s1", at(0, 14), "## Afternoon\n\n- Review the design doc\n- Sketch the schedule view");
        yield return Seed("s1", at(1, 9.5), "Planned: walk the date-range endpoint.");
        yield return Seed("s1", at(3, 16), "Retro prep.");

        yield return Seed("s3", at(-2, 15), "Spiked the editor — MDXEditor looks right.");
        yield return Seed("s3", at(0, 9), "Morning block: drafted the TDD plan.");
        yield return Seed("s3", at(0, 15), "Afternoon block: wired up FastEndpoints.");
        yield return Seed("s3", at(1, 12), "Next up: the scrolling schedule.");

        yield return Seed("s6", at(-3, 18), "Weekend reading on half-open ranges.");
        yield return Seed("s6", at(0, 6), "First half of the day, in one go.");
        yield return Seed("s6", at(0, 18), "Evening wrap-up: slice one is close.");
        yield return Seed("s6", at(2, 6), "Ahead of time: prep the create endpoint.");
    }

    /// <summary>Stamps the audit fields at construction time, so they differ from <c>OccursAt</c>.</summary>
    private static Note Seed(string scheduleShortName, DateTimeOffset occursAt, string content)
    {
        var writtenAt = DateTimeOffset.Now;

        return new Note
        {
            Id = Guid.NewGuid(),
            ScheduleShortName = scheduleShortName,
            Content = content,
            OccursAt = occursAt,
            CreatedAt = writtenAt,
            ModifiedAt = writtenAt
        };
    }
}
