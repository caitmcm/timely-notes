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
