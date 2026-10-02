using TimelyNotes.API.Models;

namespace TimelyNotes.API.Repositories;

/// <summary>
/// A list, not a database. Kept so CI and the deployed app need no server; retired once Postgres
/// is deployed.
/// </summary>
/// <param name="seedEachUser">
/// Gives each user fixtures across today ± 3 days on their first touch. "Today" is frozen then, so
/// a server left running overnight renders an empty day that looks like a frontend bug — restart it.
/// </param>
public class InMemoryNoteRepository(bool seedEachUser) : INoteRepository
{
    private readonly List<Note> _notes = [];

    private readonly HashSet<Guid> _seeded = [];

    /// <summary>Singleton, so requests share the list; a write racing a read tears it.</summary>
    private readonly Lock _gate = new();

    /// <inheritdoc />
    public Task<IReadOnlyList<Note>> GetBySchedule(
        Guid userId,
        int scheduleSpanHours,
        DateOnly searchFrom,
        DateOnly searchTo,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        lock (_gate)
        {
            IReadOnlyList<Note> notes =
            [
                .. InRange(userId, scheduleSpanHours, searchFrom, searchTo)
                    .OrderByDescending(note => note.Day)
                    .ThenByDescending(note => note.PeriodOrdinal)
            ];

            return Task.FromResult(notes);
        }
    }

    /// <inheritdoc />
    public Task<IReadOnlyList<NoteDayCount>> GetDayCountsBySchedule(
        Guid userId,
        int scheduleSpanHours,
        DateOnly searchFrom,
        DateOnly searchTo,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        lock (_gate)
        {
            IReadOnlyList<NoteDayCount> counts =
            [
                .. InRange(userId, scheduleSpanHours, searchFrom, searchTo)
                    .GroupBy(note => note.Day)
                    .Select(day => new NoteDayCount(day.Key, day.Count()))
                    .OrderBy(count => count.Day)
            ];

            return Task.FromResult(counts);
        }
    }

    /// <inheritdoc />
    public Task<UpsertResult> Upsert(Note note, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        var content = NoteContent.Normalise(note.Content);

        // One acquisition: find and write split apart lets two callers add to the same period.
        lock (_gate)
        {
            var existing = Find(note.UserId, note.ScheduleSpanHours, note.Day, note.PeriodOrdinal);

            if (existing is null)
            {
                var created = new Note
                {
                    UserId = note.UserId,
                    ScheduleSpanHours = note.ScheduleSpanHours,
                    Day = note.Day,
                    PeriodOrdinal = note.PeriodOrdinal,
                    Content = content,
                    CreatedAt = note.CreatedAt,
                    ModifiedAt = note.ModifiedAt
                };

                _notes.Add(created);

                return Task.FromResult(new UpsertResult(created, Created: true));
            }

            var replaced = new Note
            {
                UserId = existing.UserId,
                ScheduleSpanHours = existing.ScheduleSpanHours,
                Day = existing.Day,
                PeriodOrdinal = existing.PeriodOrdinal,
                Content = content,
                CreatedAt = existing.CreatedAt,
                ModifiedAt = note.ModifiedAt
            };

            _notes[_notes.IndexOf(existing)] = replaced;

            return Task.FromResult(new UpsertResult(replaced, Created: false));
        }
    }

    /// <inheritdoc />
    public Task<bool> Delete(
        Guid userId,
        int scheduleSpanHours,
        DateOnly day,
        int periodOrdinal,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        lock (_gate)
        {
            var existing = Find(userId, scheduleSpanHours, day, periodOrdinal);

            return Task.FromResult(existing is not null && _notes.Remove(existing));
        }
    }

    /// <summary>Both reads' filter, so they cannot drift apart. Call under the gate.</summary>
    private IEnumerable<Note> InRange(
        Guid userId, int scheduleSpanHours, DateOnly searchFrom, DateOnly searchTo) =>
        Notes(userId)
            .Where(note => note.ScheduleSpanHours == scheduleSpanHours)
            .Where(note => note.Day >= searchFrom && note.Day < searchTo)
            .Where(note => NoteContent.IsReadable(note.Content));

    private Note? Find(Guid userId, int scheduleSpanHours, DateOnly day, int periodOrdinal) =>
        Notes(userId).SingleOrDefault(note =>
            note.ScheduleSpanHours == scheduleSpanHours
            && note.Day == day
            && note.PeriodOrdinal == periodOrdinal);

    /// <summary>Every access goes through here, so a user is seeded before their first read or write.</summary>
    private IEnumerable<Note> Notes(Guid userId)
    {
        if (seedEachUser && _seeded.Add(userId))
        {
            _notes.AddRange(SeedNotes(userId));
        }

        return _notes.Where(note => note.UserId == userId);
    }

    private static IEnumerable<Note> SeedNotes(Guid userId)
    {
        yield return Seed(userId, 1, -3, 11, "Kick-off: sketched the domain model.");
        yield return Seed(userId, 1, -1, 12, "Pairing on the repository abstraction.");
        yield return Seed(userId, 1, 0, 10, "# Stand-up\n\nBlocked on the notes endpoint.");
        yield return Seed(userId, 1, 0, 15, "## Afternoon\n\n- Review the design doc\n- Sketch the schedule view");
        yield return Seed(userId, 1, 1, 10, "Planned: walk the date-range endpoint.");
        yield return Seed(userId, 1, 3, 17, "Retro prep.");

        yield return Seed(userId, 3, -2, 6, "Spiked the editor — MDXEditor looks right.");
        yield return Seed(userId, 3, 0, 4, "Morning block: drafted the TDD plan.");
        yield return Seed(userId, 3, 0, 6, "Afternoon block: wired up FastEndpoints.");
        yield return Seed(userId, 3, 1, 5, "Next up: the scrolling schedule.");

        yield return Seed(userId, 6, -3, 4, "Weekend reading on half-open ranges.");
        yield return Seed(userId, 6, 0, 2, "First half of the day, in one go.");
        yield return Seed(userId, 6, 0, 4, "Evening wrap-up: slice one is close.");
        yield return Seed(userId, 6, 2, 2, "Ahead of time: prep the create endpoint.");
    }

    /// <summary>Stamps the audit fields at construction time, so they differ from the note's day.</summary>
    private static Note Seed(
        Guid userId, int scheduleSpanHours, int dayOffset, int periodOrdinal, string content)
    {
        var writtenAt = DateTimeOffset.Now;

        return new Note
        {
            UserId = userId,
            ScheduleSpanHours = scheduleSpanHours,
            Day = DateOnly.FromDateTime(DateTime.Today).AddDays(dayOffset),
            PeriodOrdinal = periodOrdinal,
            Content = content,
            CreatedAt = writtenAt,
            ModifiedAt = writtenAt
        };
    }
}
