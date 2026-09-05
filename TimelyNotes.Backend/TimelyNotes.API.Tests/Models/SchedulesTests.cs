using TimelyNotes.API.Models;

namespace TimelyNotes.API.Tests.Models;

public class SchedulesTests
{
    [Theory]
    [InlineData(1, 24)]
    [InlineData(3, 8)]
    [InlineData(6, 4)]
    public void PeriodCountFor_DividesTheDayByTheSpan(int scheduleSpanHours, int expected) =>
        Assert.Equal(expected, Schedules.PeriodCountFor(scheduleSpanHours));

    [Theory]
    [InlineData(0)]
    [InlineData(5)]
    [InlineData(24)]
    [InlineData(-3)]
    public void PeriodCountFor_RejectsAnUnknownSchedule_RatherThanDefaulting(int scheduleSpanHours) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => Schedules.PeriodCountFor(scheduleSpanHours));

    /// <summary>
    /// The constraint behind the set: a span that does not divide 24 leaves a short last period,
    /// so <see cref="Schedules.PeriodCountFor"/> would stop being the period count. Adding 5 fails here.
    /// </summary>
    [Fact]
    public void EveryKnownSchedule_DividesTheDayExactly() =>
        Assert.All(Schedules.Known, span => Assert.Equal(0, 24 % span));

    [Fact]
    public void Known_IsTheThreeSchedulesTheAppOffers() =>
        Assert.Equal([1, 3, 6], Schedules.Known);

    [Theory]
    [InlineData(1, true)]
    [InlineData(3, true)]
    [InlineData(6, true)]
    [InlineData(2, false)]
    [InlineData(12, false)]
    [InlineData(0, false)]
    [InlineData(-1, false)]
    public void IsKnown_GatesOnTheOfferedSchedules(int scheduleSpanHours, bool expected) =>
        Assert.Equal(expected, Schedules.IsKnown(scheduleSpanHours));

    [Theory]
    [InlineData(1, 1)]
    [InlineData(1, 24)]
    [InlineData(3, 1)]
    [InlineData(3, 8)]
    [InlineData(6, 1)]
    [InlineData(6, 4)]
    public void IsValidPeriodOrdinal_AcceptsOneThroughTheCount(int scheduleSpanHours, int periodOrdinal) =>
        Assert.True(Schedules.IsValidPeriodOrdinal(scheduleSpanHours, periodOrdinal));

    [Theory]
    [InlineData(1, 0)]
    [InlineData(1, 25)]
    [InlineData(3, 0)]
    [InlineData(3, 9)]
    [InlineData(6, -1)]
    [InlineData(6, 5)]
    public void IsValidPeriodOrdinal_RejectsEitherSideOfTheRange(int scheduleSpanHours, int periodOrdinal) =>
        Assert.False(Schedules.IsValidPeriodOrdinal(scheduleSpanHours, periodOrdinal));

    [Fact]
    public void IsValidPeriodOrdinal_RejectsEveryOrdinalOfAnUnknownSchedule() =>
        Assert.False(Schedules.IsValidPeriodOrdinal(5, 1));

    [Theory]
    [InlineData("s1", 1)]
    [InlineData("s3", 3)]
    [InlineData("s6", 6)]
    public void TryParse_ReadsTheSpanOutOfTheSigil(string text, int expected)
    {
        Assert.True(Schedules.TryParse(text, out var scheduleSpanHours));
        Assert.Equal(expected, scheduleSpanHours);
    }

    [Theory]
    [InlineData("3")]
    [InlineData("S3")]
    [InlineData("s")]
    [InlineData("s5")]
    [InlineData("s03")]
    [InlineData("s3p1")]
    [InlineData("")]
    [InlineData(null)]
    public void TryParse_RejectsAnythingElse(string? text) =>
        Assert.False(Schedules.TryParse(text, out _));

    [Theory]
    [InlineData(1, "s1")]
    [InlineData(3, "s3")]
    [InlineData(6, "s6")]
    public void Format_PutsTheSigilBack(int scheduleSpanHours, string expected) =>
        Assert.Equal(expected, Schedules.Format(scheduleSpanHours));

    [Fact]
    public void FormatAndTryParse_RoundTripEveryKnownSchedule() =>
        Assert.All(Schedules.Known, span =>
        {
            Assert.True(Schedules.TryParse(Schedules.Format(span), out var parsed));
            Assert.Equal(span, parsed);
        });
}
