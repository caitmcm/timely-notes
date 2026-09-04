using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Tests.Repositories;

public class InMemoryNoteRepositoryTests
{
    private static readonly DateTimeOffset Today = new(DateTime.Today, DateTimeOffset.Now.Offset);

    private static DateTimeOffset Day(int offsetInDays) => Today.AddDays(offsetInDays);

    /// <summary>Wider than the seed, either side.</summary>
    private static (DateTimeOffset From, DateTimeOffset To) WholeSeed => (Day(-4), Day(4));

    [Fact]
    public async Task GetBySchedule_ReturnsSeededNotes_ForAKnownSchedule()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            "s1", WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.NotEmpty(notes);
        Assert.All(notes, note => Assert.Equal("s1", note.ScheduleShortName));
    }

    [Theory]
    [InlineData("s1")]
    [InlineData("s3")]
    [InlineData("s6")]
    public async Task GetBySchedule_SeedsEverySchedule(string scheduleShortName)
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            scheduleShortName, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.NotEmpty(notes);
        Assert.All(notes, note => Assert.Equal(scheduleShortName, note.ScheduleShortName));
    }

    [Fact]
    public async Task GetBySchedule_ReturnsEmpty_ForAnUnknownSchedule()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            "s99", WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.Empty(notes);
    }

    [Fact]
    public async Task GetBySchedule_PopulatesEveryNoteField()
    {
        var repository = new InMemoryNoteRepository();

        var note = (await repository.GetBySchedule(
            "s1", WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken)).First();

        Assert.NotEqual(Guid.Empty, note.Id);
        Assert.False(string.IsNullOrWhiteSpace(note.Content));
        Assert.NotEqual(default, note.OccursAt);
        Assert.NotEqual(default, note.CreatedAt);
        Assert.NotEqual(default, note.ModifiedAt);
    }

    [Theory]
    [InlineData("s1")]
    [InlineData("s3")]
    [InlineData("s6")]
    public async Task GetBySchedule_SeedsNotesAcrossTheSurroundingWeek_IncludingToday(string scheduleShortName)
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            scheduleShortName, WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.All(notes, note =>
        {
            Assert.InRange(note.OccursAt, Day(-3), Day(4));
        });
        Assert.Contains(notes, note => note.OccursAt.LocalDateTime.Date == DateTime.Today);
        Assert.Contains(notes, note => note.OccursAt < Today);
        Assert.Contains(notes, note => note.OccursAt >= Day(1));
    }

    [Fact]
    public async Task GetBySchedule_ReturnsOnlyNotesWhoseOccursAtFallsInTheRange()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            "s1", Today, Day(1), TestContext.Current.CancellationToken);

        Assert.NotEmpty(notes);
        Assert.All(notes, note => Assert.Equal(DateTime.Today, note.OccursAt.LocalDateTime.Date));
    }

    [Fact]
    public async Task GetBySchedule_FiltersOnOccursAtRatherThanCreatedAt()
    {
        var repository = new InMemoryNoteRepository();

        // Every seeded CreatedAt is today, so a three-day-back window proves OccursAt does the filtering.
        var past = await repository.GetBySchedule(
            "s1", Day(-3), Day(-2), TestContext.Current.CancellationToken);
        var today = await repository.GetBySchedule(
            "s1", Today, Day(1), TestContext.Current.CancellationToken);

        Assert.NotEmpty(past);
        Assert.All(past, note => Assert.Equal(DateTime.Today, note.CreatedAt.LocalDateTime.Date));
        Assert.DoesNotContain(today, note => past.Any(earlier => earlier.Id == note.Id));
    }

    [Fact]
    public async Task GetBySchedule_IncludesANoteAtExactlySearchFrom()
    {
        var repository = new InMemoryNoteRepository();
        var all = await repository.GetBySchedule(
            "s1", WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);
        var boundary = all.Min(note => note.OccursAt);

        var notes = await repository.GetBySchedule(
            "s1", boundary, boundary.AddDays(1), TestContext.Current.CancellationToken);

        Assert.Contains(notes, note => note.OccursAt == boundary);
    }

    [Fact]
    public async Task GetBySchedule_ExcludesANoteAtExactlySearchTo()
    {
        var repository = new InMemoryNoteRepository();
        var all = await repository.GetBySchedule(
            "s1", WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);
        var boundary = all.Max(note => note.OccursAt);

        var notes = await repository.GetBySchedule(
            "s1", boundary.AddDays(-1), boundary, TestContext.Current.CancellationToken);

        Assert.DoesNotContain(notes, note => note.OccursAt == boundary);
    }

    [Fact]
    public async Task GetBySchedule_AdjacentWindowsNeverReturnTheSameNoteTwice()
    {
        var repository = new InMemoryNoteRepository();

        var earlier = await repository.GetBySchedule(
            "s1", Day(-3), Day(0), TestContext.Current.CancellationToken);
        var later = await repository.GetBySchedule(
            "s1", Day(0), Day(3), TestContext.Current.CancellationToken);

        Assert.NotEmpty(earlier);
        Assert.NotEmpty(later);
        Assert.Empty(earlier.Select(note => note.Id).Intersect(later.Select(note => note.Id)));
    }

    [Fact]
    public async Task GetBySchedule_DropsAnotherSchedulesNotesInTheSameRange()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            "s3", Today, Day(1), TestContext.Current.CancellationToken);

        Assert.NotEmpty(notes);
        Assert.All(notes, note => Assert.Equal("s3", note.ScheduleShortName));
    }

    [Fact]
    public async Task GetBySchedule_OrdersNotesNewestFirstByOccursAt()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            "s1", WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.Equal(notes.OrderByDescending(note => note.OccursAt), notes);
    }

    [Fact]
    public async Task GetBySchedule_ReturnsAnEmptyList_ForARangeHoldingNothing()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(
            "s1", Day(300), Day(301), TestContext.Current.CancellationToken);

        Assert.NotNull(notes);
        Assert.Empty(notes);
    }

    [Fact]
    public async Task GetDayCountsBySchedule_ReturnsOneEntryPerDayThatHasNotes()
    {
        var repository = new InMemoryNoteRepository();

        var counts = await repository.GetDayCountsBySchedule(
            "s1", WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);
        var notes = await repository.GetBySchedule(
            "s1", WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.Equal(notes.Select(note => note.OccursAt.Date).Distinct().Count(), counts.Count);
        Assert.All(counts, count => Assert.True(count.Count > 0));
        Assert.Equal(notes.Count, counts.Sum(count => count.Count));
    }

    [Fact]
    public async Task GetDayCountsBySchedule_CountsEveryNoteOnADay()
    {
        var repository = new InMemoryNoteRepository();

        var counts = await repository.GetDayCountsBySchedule(
            "s1", Today, Day(1), TestContext.Current.CancellationToken);

        // The seed puts two s1 notes on today.
        var today = Assert.Single(counts);
        Assert.Equal(Today, today.Day);
        Assert.Equal(2, today.Count);
    }

    [Fact]
    public async Task GetDayCountsBySchedule_OrdersDaysAscending()
    {
        var repository = new InMemoryNoteRepository();

        var counts = await repository.GetDayCountsBySchedule(
            "s1", WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.Equal(counts.OrderBy(count => count.Day), counts);
    }

    [Fact]
    public async Task GetDayCountsBySchedule_OmitsDaysWithNoNotes()
    {
        var repository = new InMemoryNoteRepository();

        var counts = await repository.GetDayCountsBySchedule(
            "s1", WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);

        // The seed leaves day +2 empty for s1.
        Assert.DoesNotContain(counts, count => count.Day == Day(2));
    }

    [Fact]
    public async Task GetDayCountsBySchedule_HonoursTheHalfOpenWindow()
    {
        var repository = new InMemoryNoteRepository();
        var all = await repository.GetBySchedule(
            "s1", WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);
        var first = all.Min(note => note.OccursAt);
        var last = all.Max(note => note.OccursAt);

        var counts = await repository.GetDayCountsBySchedule(
            "s1", first, last, TestContext.Current.CancellationToken);

        Assert.Contains(counts, count => count.Day == new DateTimeOffset(first.Date, first.Offset));
        Assert.Equal(all.Count - 1, counts.Sum(count => count.Count));
    }

    [Fact]
    public async Task GetDayCountsBySchedule_DropsAnotherSchedulesNotes()
    {
        var repository = new InMemoryNoteRepository();

        var counts = await repository.GetDayCountsBySchedule(
            "s1", Today, Day(1), TestContext.Current.CancellationToken);
        var otherNotes = await repository.GetBySchedule(
            "s3", Today, Day(1), TestContext.Current.CancellationToken);

        Assert.NotEmpty(otherNotes);
        Assert.Equal(2, counts.Sum(count => count.Count));
    }

    [Fact]
    public async Task GetDayCountsBySchedule_GroupsInSearchFromsOffset()
    {
        var repository = new InMemoryNoteRepository();
        var seedOffset = Today.Offset;
        // Far enough east that the seed's 18:00 notes fall on the following day.
        var shifted = seedOffset + TimeSpan.FromHours(10);

        var atSeedOffset = await repository.GetDayCountsBySchedule(
            "s6", WholeSeed.From, WholeSeed.To, TestContext.Current.CancellationToken);
        var atShiftedOffset = await repository.GetDayCountsBySchedule(
            "s6", WholeSeed.From.ToOffset(shifted), WholeSeed.To, TestContext.Current.CancellationToken);

        Assert.All(atSeedOffset, count => Assert.Equal(seedOffset, count.Day.Offset));
        Assert.All(atShiftedOffset, count => Assert.Equal(shifted, count.Day.Offset));
        // The same instants, bucketed differently: the 18:00 notes move on to the following day.
        Assert.NotEqual(
            atSeedOffset.Select(count => (count.Day.Date, count.Count)),
            atShiftedOffset.Select(count => (count.Day.Date, count.Count)));
    }

    [Fact]
    public async Task GetDayCountsBySchedule_ReturnsAnEmptyList_ForARangeHoldingNothing()
    {
        var repository = new InMemoryNoteRepository();

        var counts = await repository.GetDayCountsBySchedule(
            "s1", Day(300), Day(301), TestContext.Current.CancellationToken);

        Assert.NotNull(counts);
        Assert.Empty(counts);
    }
}
