using TimelyNotes.API.Models;
using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Tests.Repositories;

public class InMemoryNoteRepositoryTests
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.Today);

    private static DateOnly Day(int offsetInDays) => Today.AddDays(offsetInDays);

    /// <summary>Wider than the seed, either side.</summary>
    private static (DateOnly From, DateOnly To) WholeSeed => (Day(-4), Day(4));

    [Fact]
    public async Task GetBySchedule_ReturnsSeededNotes_ForAKnownSchedule()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            1, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.NotEmpty(notes);
        Assert.All(notes, note => Assert.Equal(1, note.ScheduleSpanHours));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(6)]
    public async Task GetBySchedule_SeedsEverySchedule(int scheduleSpanHours)
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            scheduleSpanHours, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.NotEmpty(notes);
        Assert.All(notes, note => Assert.Equal(scheduleSpanHours, note.ScheduleSpanHours));
    }

    /// <summary>Filtering is the repository's job; rejecting an unknown Schedule is the validator's.</summary>
    [Fact]
    public async Task GetBySchedule_ReturnsEmpty_ForAnUnknownSchedule()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            5, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.Empty(notes);
    }

    [Fact]
    public async Task GetBySchedule_PopulatesEveryNoteField()
    {
        var repository = new InMemoryNoteRepository();

        var note = (await repository.GetBySchedule(
            1, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken)).First();

        Assert.Equal(1, note.ScheduleSpanHours);
        Assert.NotEqual(default, note.Day);
        Assert.True(note.PeriodOrdinal >= 1);
        Assert.False(string.IsNullOrWhiteSpace(note.Content));
        Assert.NotEqual(default, note.CreatedAt);
        Assert.NotEqual(default, note.ModifiedAt);
    }

    [Fact]
    public async Task SeededNotes_AreIdentifiedByScheduleDayAndPeriodOrdinal()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await AllSeeded(repository);
        var keys = notes
            .Select(note => (note.ScheduleSpanHours, note.Day, note.PeriodOrdinal))
            .ToList();

        Assert.NotEmpty(keys);
        Assert.Equal(keys.Count, keys.Distinct().Count());
    }

    [Fact]
    public async Task EverySeededNotesPeriodOrdinal_IsValidForItsSchedule()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await AllSeeded(repository);

        Assert.NotEmpty(notes);
        Assert.All(notes, note =>
            Assert.True(
                Schedules.IsValidPeriodOrdinal(note.ScheduleSpanHours, note.PeriodOrdinal),
                $"p{note.PeriodOrdinal} is not a period of {Schedules.Format(note.ScheduleSpanHours)}."));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(6)]
    public async Task TheSeed_PutsTwoNotesInDifferentPeriodsOfToday(int scheduleSpanHours)
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            scheduleSpanHours, Today, Day(1), TestContext.Current.CancellationToken);

        Assert.Equal(2, notes.Count);
        Assert.Equal(2, notes.Select(note => note.PeriodOrdinal).Distinct().Count());
    }

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(6)]
    public async Task GetBySchedule_SeedsNotesAcrossTheSurroundingWeek_IncludingToday(int scheduleSpanHours)
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            scheduleSpanHours, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.All(notes, note => Assert.InRange(note.Day, Day(-3), Day(3)));
        Assert.Contains(notes, note => note.Day == Today);
        Assert.Contains(notes, note => note.Day < Today);
        Assert.Contains(notes, note => note.Day >= Day(1));
    }

    [Fact]
    public async Task GetBySchedule_ReturnsOnlyNotesWhoseDayFallsInTheRange()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            1, Today, Day(1), TestContext.Current.CancellationToken);

        Assert.NotEmpty(notes);
        Assert.All(notes, note => Assert.Equal(Today, note.Day));
    }

    [Fact]
    public async Task GetBySchedule_FiltersOnDayRatherThanCreatedAt()
    {
        var repository = new InMemoryNoteRepository();

        // Every seeded CreatedAt is today, so a three-day-back window proves Day does the filtering.
        var past = await repository.GetBySchedule(
            1, Day(-3), Day(-2), TestContext.Current.CancellationToken);

        Assert.NotEmpty(past);
        Assert.All(past, note => Assert.Equal(DateTime.Today, note.CreatedAt.LocalDateTime.Date));
        Assert.All(past, note => Assert.Equal(Day(-3), note.Day));
    }

    [Fact]
    public async Task GetBySchedule_IncludesANoteOnExactlySearchFrom()
    {
        var repository = new InMemoryNoteRepository();
        var boundary = (await AllSeeded(repository)).Min(note => note.Day);

        var notes = await repository.GetBySchedule(
            1, boundary, boundary.AddDays(1), TestContext.Current.CancellationToken);

        Assert.Contains(notes, note => note.Day == boundary);
    }

    [Fact]
    public async Task GetBySchedule_ExcludesANoteOnExactlySearchTo()
    {
        var repository = new InMemoryNoteRepository();
        var boundary = (await AllSeeded(repository)).Max(note => note.Day);

        var notes = await repository.GetBySchedule(
            1, boundary.AddDays(-1), boundary, TestContext.Current.CancellationToken);

        Assert.DoesNotContain(notes, note => note.Day == boundary);
    }

    [Fact]
    public async Task GetBySchedule_AdjacentWindowsNeverReturnTheSameNoteTwice()
    {
        var repository = new InMemoryNoteRepository();

        var earlier = await repository.GetBySchedule(
            1, Day(-3), Today, TestContext.Current.CancellationToken);
        var later = await repository.GetBySchedule(
            1, Today, Day(3), TestContext.Current.CancellationToken);

        Assert.NotEmpty(earlier);
        Assert.NotEmpty(later);
        Assert.Empty(Keys(earlier).Intersect(Keys(later)));
    }

    [Fact]
    public async Task GetBySchedule_DropsAnotherSchedulesNotesInTheSameRange()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            3, Today, Day(1), TestContext.Current.CancellationToken);

        Assert.NotEmpty(notes);
        Assert.All(notes, note => Assert.Equal(3, note.ScheduleSpanHours));
    }

    /// <summary>Two notes share today, so the period tiebreak is asserted rather than incidental.</summary>
    [Fact]
    public async Task GetBySchedule_OrdersNotesNewestFirstByDayThenPeriodOrdinal()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            1, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);
        var today = notes.Where(note => note.Day == Today).ToList();

        Assert.Equal(
            notes.OrderByDescending(note => note.Day).ThenByDescending(note => note.PeriodOrdinal),
            notes);
        Assert.Equal(2, today.Count);
        Assert.True(today[0].PeriodOrdinal > today[1].PeriodOrdinal);
    }

    [Fact]
    public async Task GetBySchedule_ReturnsAnEmptyList_ForARangeHoldingNothing()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            1, Day(300), Day(301), TestContext.Current.CancellationToken);

        Assert.NotNull(notes);
        Assert.Empty(notes);
    }

    [Fact]
    public async Task GetDayCountsBySchedule_ReturnsOneEntryPerDayThatHasNotes()
    {
        var repository = new InMemoryNoteRepository();

        var counts = await repository.GetDayCountsBySchedule(
            1, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);
        var notes = await repository.GetBySchedule(
            1, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.Equal(notes.Select(note => note.Day).Distinct().Count(), counts.Count);
        Assert.All(counts, count => Assert.True(count.Count > 0));
        Assert.Equal(notes.Count, counts.Sum(count => count.Count));
    }

    [Fact]
    public async Task GetDayCountsBySchedule_CountsEveryNoteOnADay()
    {
        var repository = new InMemoryNoteRepository();

        var counts = await repository.GetDayCountsBySchedule(
            1, Today, Day(1), TestContext.Current.CancellationToken);

        var today = Assert.Single(counts);
        Assert.Equal(Today, today.Day);
        Assert.Equal(2, today.Count);
    }

    [Fact]
    public async Task GetDayCountsBySchedule_OrdersDaysAscending()
    {
        var repository = new InMemoryNoteRepository();

        var counts = await repository.GetDayCountsBySchedule(
            1, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.Equal(counts.OrderBy(count => count.Day), counts);
    }

    [Fact]
    public async Task GetDayCountsBySchedule_OmitsDaysWithNoNotes()
    {
        var repository = new InMemoryNoteRepository();

        var counts = await repository.GetDayCountsBySchedule(
            1, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        // The seed leaves day +2 empty for s1.
        Assert.DoesNotContain(counts, count => count.Day == Day(2));
    }

    [Fact]
    public async Task GetDayCountsBySchedule_HonoursTheHalfOpenWindow()
    {
        var repository = new InMemoryNoteRepository();
        var all = await repository.GetBySchedule(
            1, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);
        var first = all.Min(note => note.Day);
        var last = all.Max(note => note.Day);

        var counts = await repository.GetDayCountsBySchedule(
            1, first, last, TestContext.Current.CancellationToken);

        Assert.Contains(counts, count => count.Day == first);
        Assert.DoesNotContain(counts, count => count.Day == last);
        Assert.Equal(
            all.Count - all.Count(note => note.Day == last),
            counts.Sum(count => count.Count));
    }

    [Fact]
    public async Task GetDayCountsBySchedule_DropsAnotherSchedulesNotes()
    {
        var repository = new InMemoryNoteRepository();

        var counts = await repository.GetDayCountsBySchedule(
            1, Today, Day(1), TestContext.Current.CancellationToken);
        var otherNotes = await repository.GetBySchedule(
            3, Today, Day(1), TestContext.Current.CancellationToken);

        Assert.NotEmpty(otherNotes);
        Assert.Equal(2, counts.Sum(count => count.Count));
    }

    [Fact]
    public async Task GetDayCountsBySchedule_ReturnsAnEmptyList_ForARangeHoldingNothing()
    {
        var repository = new InMemoryNoteRepository();

        var counts = await repository.GetDayCountsBySchedule(
            1, Day(300), Day(301), TestContext.Current.CancellationToken);

        Assert.NotNull(counts);
        Assert.Empty(counts);
    }

    // --- Writes -------------------------------------------------------------------------------

    /// <summary>A period the seed leaves empty for every Schedule, so a write never collides.</summary>
    private static readonly DateOnly WriteDay = Today.AddDays(200);

    private static Note NoteAt(
        int scheduleSpanHours,
        DateOnly day,
        int periodOrdinal,
        string content,
        DateTimeOffset? at = null)
    {
        var stamp = at ?? new DateTimeOffset(2026, 8, 25, 9, 30, 0, TimeSpan.Zero);

        return new Note
        {
            ScheduleSpanHours = scheduleSpanHours,
            Day = day,
            PeriodOrdinal = periodOrdinal,
            Content = content,
            CreatedAt = stamp,
            ModifiedAt = stamp
        };
    }

    private static Task<IReadOnlyList<Note>> NotesAround(
        InMemoryNoteRepository repository, int scheduleSpanHours, DateOnly day) =>
        repository.GetBySchedule(
            scheduleSpanHours, day, day.AddDays(1), TestContext.Current.CancellationToken);

    [Fact]
    public async Task Upsert_CreatesANoteInAnEmptyPeriod()
    {
        var repository = new InMemoryNoteRepository();

        var result = await repository.Upsert(
            NoteAt(1, WriteDay, 9, "New."), TestContext.Current.CancellationToken);

        Assert.True(result.Created);
        Assert.Equal("New.", result.Note.Content);

        var note = Assert.Single(await NotesAround(repository, 1, WriteDay));
        Assert.Equal(9, note.PeriodOrdinal);
        Assert.Equal("New.", note.Content);
    }

    [Fact]
    public async Task Upsert_LeavesTheSeedAlone()
    {
        var repository = new InMemoryNoteRepository();
        var before = (await AllSeeded(repository)).Count;

        await repository.Upsert(
            NoteAt(1, WriteDay, 9, "New."), TestContext.Current.CancellationToken);

        Assert.Equal(before, (await AllSeeded(repository)).Count);
    }

    [Fact]
    public async Task Upsert_ReplacesTheContentAndModifiedAt_LeavingTheRestOfTheNoteAlone()
    {
        var repository = new InMemoryNoteRepository();
        var createdAt = new DateTimeOffset(2026, 8, 25, 9, 0, 0, TimeSpan.Zero);
        var modifiedAt = createdAt.AddHours(2);

        await repository.Upsert(
            NoteAt(1, WriteDay, 9, "First.", createdAt), TestContext.Current.CancellationToken);
        var result = await repository.Upsert(
            NoteAt(1, WriteDay, 9, "Second.", modifiedAt), TestContext.Current.CancellationToken);

        Assert.False(result.Created);

        var note = Assert.Single(await NotesAround(repository, 1, WriteDay));
        Assert.Equal("Second.", note.Content);
        Assert.Equal(modifiedAt, note.ModifiedAt);
        // The create path's stamp survives: only a create honours the caller's CreatedAt.
        Assert.Equal(createdAt, note.CreatedAt);
        Assert.Equal(WriteDay, note.Day);
        Assert.Equal(9, note.PeriodOrdinal);
        Assert.Equal(1, note.ScheduleSpanHours);
    }

    /// <summary>The property the whole write path rests on.</summary>
    [Fact]
    public async Task Upsert_SentTwice_LeavesExactlyOneNote()
    {
        var repository = new InMemoryNoteRepository();
        var note = NoteAt(1, WriteDay, 9, "Same.");

        await repository.Upsert(note, TestContext.Current.CancellationToken);
        await repository.Upsert(note, TestContext.Current.CancellationToken);

        Assert.Single(await NotesAround(repository, 1, WriteDay));
    }

    [Fact]
    public async Task Upsert_TreatsTheSamePeriodUnderAnotherScheduleAsADifferentNote()
    {
        var repository = new InMemoryNoteRepository();

        await repository.Upsert(
            NoteAt(1, WriteDay, 4, "Hourly."), TestContext.Current.CancellationToken);
        await repository.Upsert(
            NoteAt(3, WriteDay, 4, "Three-hourly."), TestContext.Current.CancellationToken);

        Assert.Equal("Hourly.", Assert.Single(await NotesAround(repository, 1, WriteDay)).Content);
        Assert.Equal(
            "Three-hourly.", Assert.Single(await NotesAround(repository, 3, WriteDay)).Content);
    }

    /// <summary>All three parts of the key are compared: change any one and it is another note.</summary>
    [Theory]
    [InlineData(3, 0, 9)]
    [InlineData(1, 1, 9)]
    [InlineData(1, 0, 10)]
    public async Task Upsert_ReachesADifferentNote_WhenAnyPartOfTheAddressDiffers(
        int scheduleSpanHours, int dayOffset, int periodOrdinal)
    {
        var repository = new InMemoryNoteRepository();

        await repository.Upsert(
            NoteAt(1, WriteDay, 9, "Original."), TestContext.Current.CancellationToken);
        var result = await repository.Upsert(
            NoteAt(scheduleSpanHours, WriteDay.AddDays(dayOffset), periodOrdinal, "Other."),
            TestContext.Current.CancellationToken);

        Assert.True(result.Created);

        var original = Assert.Single(
            await NotesAround(repository, 1, WriteDay), note => note.PeriodOrdinal == 9);
        Assert.Equal("Original.", original.Content);
    }

    [Fact]
    public async Task Delete_RemovesTheNoteFromBothReads()
    {
        var repository = new InMemoryNoteRepository();
        await repository.Upsert(
            NoteAt(1, WriteDay, 9, "Doomed."), TestContext.Current.CancellationToken);

        var deleted = await repository.Delete(1, WriteDay, 9, TestContext.Current.CancellationToken);

        Assert.True(deleted);
        Assert.Empty(await NotesAround(repository, 1, WriteDay));
        Assert.Empty(await repository.GetDayCountsBySchedule(
            1, WriteDay, WriteDay.AddDays(1), TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Delete_ReportsFalse_ForAPeriodHoldingNothing()
    {
        var repository = new InMemoryNoteRepository();

        Assert.False(
            await repository.Delete(1, WriteDay, 9, TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Delete_LeavesTheSamePeriodUnderAnotherScheduleAlone()
    {
        var repository = new InMemoryNoteRepository();
        await repository.Upsert(
            NoteAt(1, WriteDay, 4, "Hourly."), TestContext.Current.CancellationToken);
        await repository.Upsert(
            NoteAt(3, WriteDay, 4, "Three-hourly."), TestContext.Current.CancellationToken);

        await repository.Delete(1, WriteDay, 4, TestContext.Current.CancellationToken);

        Assert.Equal(
            "Three-hourly.", Assert.Single(await NotesAround(repository, 3, WriteDay)).Content);
    }

    // --- Empty notes are stored but never read ------------------------------------------------

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\n\n")]
    public async Task GetBySchedule_OmitsANoteWhoseContentIsEmpty(string content)
    {
        var repository = new InMemoryNoteRepository();
        await repository.Upsert(
            NoteAt(1, WriteDay, 9, content), TestContext.Current.CancellationToken);

        Assert.Empty(await NotesAround(repository, 1, WriteDay));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\n\n")]
    public async Task GetDayCountsBySchedule_OmitsADayWhoseOnlyNoteIsEmpty(string content)
    {
        var repository = new InMemoryNoteRepository();
        await repository.Upsert(
            NoteAt(1, WriteDay, 9, content), TestContext.Current.CancellationToken);

        var counts = await repository.GetDayCountsBySchedule(
            1, WriteDay, WriteDay.AddDays(1), TestContext.Current.CancellationToken);

        // Absent entirely rather than present as a zero: a marker would render a blank day.
        Assert.Empty(counts);
    }

    [Fact]
    public async Task GetDayCountsBySchedule_CountsOnlyTheReadableNotesOfADay()
    {
        var repository = new InMemoryNoteRepository();
        await repository.Upsert(
            NoteAt(1, WriteDay, 9, "Readable."), TestContext.Current.CancellationToken);
        await repository.Upsert(
            NoteAt(1, WriteDay, 10, "   "), TestContext.Current.CancellationToken);

        var counts = await repository.GetDayCountsBySchedule(
            1, WriteDay, WriteDay.AddDays(1), TestContext.Current.CancellationToken);

        Assert.Equal(1, Assert.Single(counts).Count);
    }

    /// <summary>The filter judges emptiness, not whether the writing was worth it.</summary>
    [Theory]
    [InlineData("#")]
    [InlineData("-")]
    public async Task GetBySchedule_KeepsANoteThatIsSmallButNotEmpty(string content)
    {
        var repository = new InMemoryNoteRepository();
        await repository.Upsert(
            NoteAt(1, WriteDay, 9, content), TestContext.Current.CancellationToken);

        Assert.Equal(content, Assert.Single(await NotesAround(repository, 1, WriteDay)).Content);
    }

    /// <summary>An emptied note is hidden, not forgotten: writing content again brings it back.</summary>
    [Fact]
    public async Task Upsert_OverAnEmptiedNote_ReplacesRatherThanCreates()
    {
        var repository = new InMemoryNoteRepository();
        await repository.Upsert(
            NoteAt(1, WriteDay, 9, "First."), TestContext.Current.CancellationToken);
        await repository.Upsert(
            NoteAt(1, WriteDay, 9, ""), TestContext.Current.CancellationToken);

        var result = await repository.Upsert(
            NoteAt(1, WriteDay, 9, "Back."), TestContext.Current.CancellationToken);

        Assert.False(result.Created);
        Assert.Equal("Back.", Assert.Single(await NotesAround(repository, 1, WriteDay)).Content);
    }

    [Fact]
    public async Task Delete_RemovesAnEmptyNote()
    {
        var repository = new InMemoryNoteRepository();
        await repository.Upsert(
            NoteAt(1, WriteDay, 9, ""), TestContext.Current.CancellationToken);

        Assert.True(await repository.Delete(1, WriteDay, 9, TestContext.Current.CancellationToken));
        Assert.False(await repository.Delete(1, WriteDay, 9, TestContext.Current.CancellationToken));
    }

    private static async Task<IReadOnlyList<Note>> AllSeeded(InMemoryNoteRepository repository)
    {
        var notes = new List<Note>();

        foreach (var scheduleSpanHours in Schedules.Known)
        {
            notes.AddRange(await repository.GetBySchedule(
                scheduleSpanHours, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken));
        }

        return notes;
    }

    private static IEnumerable<(DateOnly Day, int PeriodOrdinal)> Keys(IEnumerable<Note> notes) =>
        notes.Select(note => (note.Day, note.PeriodOrdinal));
}
