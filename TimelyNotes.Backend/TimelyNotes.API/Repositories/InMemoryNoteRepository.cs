using TimelyNotes.API.Models;

namespace TimelyNotes.API.Repositories;

/// <summary>
/// Placeholder store holding notes in memory, seeded with example data. Registered as a singleton
/// so the seeded state survives across requests.
/// </summary>
/// <remarks>
/// The seed spreads notes over local midnight <em>today</em> ± 3 days, so a three-day window returns
/// a strict subset and scroll-driven fetches have something to load in either direction. Because the
/// singleton is built at startup, "today" is frozen when the process starts: a server left running
/// across midnight keeps serving the previous day's window. Acceptable for a dev-only seed —
/// restart the API to re-anchor it.
/// </remarks>
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
                // Half-open: searchFrom inclusive, searchTo exclusive.
                .Where(note => note.OccursAt >= searchFrom && note.OccursAt < searchTo)
                .OrderByDescending(note => note.OccursAt)
        ];

        return Task.FromResult(notes);
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

    /// <summary>
    /// Seeds one note. <c>OccursAt</c> is the slot it is written into; <c>CreatedAt</c> and
    /// <c>ModifiedAt</c> are the construction time — so the seed itself shows the two are independent.
    /// </summary>
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
