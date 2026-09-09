using TimelyNotes.API.Models;

namespace TimelyNotes.API.Tests.Models;

public class PeriodsTests
{
    [Theory]
    [InlineData(3, "p1", 1)]
    [InlineData(3, "p4", 4)]
    [InlineData(3, "p8", 8)]
    [InlineData(1, "p24", 24)]
    [InlineData(6, "p4", 4)]
    public void TryParse_ReadsTheOrdinalOutOfTheSigil(
        int scheduleSpanHours, string text, int expected)
    {
        Assert.True(Periods.TryParse(scheduleSpanHours, text, out var periodOrdinal));
        Assert.Equal(expected, periodOrdinal);
    }

    /// <summary>
    /// One spelling addresses one period. Under the earlier <c>p{ordinal}</c> route the router split
    /// the sigil off and <c>int.TryParse</c> took the rest, so <c>p04</c> and <c>p+4</c> reached the
    /// same note as <c>p4</c> — three spellings for one address.
    /// </summary>
    [Theory]
    [InlineData("4")]
    [InlineData("P4")]
    [InlineData("p")]
    [InlineData("p04")]
    [InlineData("p+4")]
    [InlineData("p-4")]
    [InlineData("p 4")]
    [InlineData("p4p1")]
    [InlineData("s4")]
    [InlineData("")]
    [InlineData(null)]
    public void TryParse_RejectsAnySpellingButTheOne(string? text) =>
        Assert.False(Periods.TryParse(3, text, out _));

    /// <summary>
    /// The relationship the type exists to carry: a period is a period *of a Schedule*, so there is
    /// no way to obtain an ordinal without naming the Schedule that chops the day into it.
    /// </summary>
    [Theory]
    [InlineData(3, "p9")]
    [InlineData(3, "p0")]
    [InlineData(6, "p5")]
    [InlineData(1, "p25")]
    public void TryParse_RejectsAnOrdinalTheScheduleDoesNotHave(int scheduleSpanHours, string text) =>
        Assert.False(Periods.TryParse(scheduleSpanHours, text, out _));

    [Theory]
    [InlineData(0)]
    [InlineData(5)]
    [InlineData(-3)]
    public void TryParse_RejectsEveryPeriodOfAnUnknownSchedule(int scheduleSpanHours) =>
        Assert.False(Periods.TryParse(scheduleSpanHours, "p1", out _));

    /// <summary>The same spelling means different periods under different Schedules, and neither is wrong.</summary>
    [Fact]
    public void TryParse_ReadsOneSpellingAgainstTheScheduleItWasGiven()
    {
        Assert.True(Periods.TryParse(1, "p9", out var hourly));
        Assert.False(Periods.TryParse(3, "p9", out _));
        Assert.Equal(9, hourly);
    }

    [Theory]
    [InlineData(1, "p1")]
    [InlineData(4, "p4")]
    [InlineData(24, "p24")]
    public void Format_PutsTheSigilBack(int periodOrdinal, string expected) =>
        Assert.Equal(expected, Periods.Format(periodOrdinal));

    [Fact]
    public void FormatAndTryParse_RoundTripEveryPeriodOfEverySchedule() =>
        Assert.All(Schedules.Known, span =>
            Assert.All(
                Enumerable.Range(1, Schedules.PeriodCountFor(span)),
                ordinal =>
                {
                    Assert.True(Periods.TryParse(span, Periods.Format(ordinal), out var parsed));
                    Assert.Equal(ordinal, parsed);
                }));
}
