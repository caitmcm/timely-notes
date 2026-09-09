using System.Net;
using System.Net.Http.Json;
using FastEndpoints.Testing;
using TimelyNotes.API.Endpoints.Notes;

namespace TimelyNotes.API.Tests.Endpoints.Notes;

public class UpsertNoteEndpointTests(WriteApiFixture app) : TestBase<WriteApiFixture>
{
    /// <summary>Far from the seed, so a write never lands on one of its periods.</summary>
    private static readonly DateOnly WriteDay = DateOnly.FromDateTime(DateTime.Today).AddDays(500);

    private static int _nextOrdinal = 1;

    /// <summary>The store is shared across this class's tests, so each takes its own period.</summary>
    private static int FreshOrdinal() => Interlocked.Increment(ref _nextOrdinal);

    private static string Route(string schedule, DateOnly day, int ordinal) =>
        $"/api/schedules/{schedule}/notes/{day:yyyy-MM-dd}/p{ordinal}";

    private Task<HttpResponseMessage> Put(string schedule, DateOnly day, int ordinal, object body) =>
        app.Client.PutAsJsonAsync(
            Route(schedule, day, ordinal), body, TestContext.Current.CancellationToken);

    private Task<HttpResponseMessage> Put(string schedule, DateOnly day, int ordinal, string? content) =>
        Put(schedule, day, ordinal, new { content });

    private static async Task<NoteResponse> Body(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<NoteResponse>(
            TestContext.Current.CancellationToken))!;

    private async Task<List<NoteResponse>> Get(string schedule, DateOnly day)
    {
        var response = await app.Client.GetAsync(
            $"/api/schedules/{schedule}/notes?searchFrom={day:yyyy-MM-dd}"
            + $"&searchTo={day.AddDays(1):yyyy-MM-dd}",
            TestContext.Current.CancellationToken);

        return (await response.Content.ReadFromJsonAsync<List<NoteResponse>>(
            TestContext.Current.CancellationToken))!;
    }

    [Fact]
    public async Task Returns201WithTheNote_WhenThePeriodHeldNothing()
    {
        var ordinal = FreshOrdinal();

        var response = await Put("s1", WriteDay, ordinal, "Created.");
        var note = await Body(response);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("Created.", note.Content);
        Assert.Equal(WriteDay, note.Day);
        Assert.Equal(ordinal, note.PeriodOrdinal);
    }

    [Fact]
    public async Task StampsACreatedNoteWithTheServersClock()
    {
        var response = await Put("s1", WriteDay, FreshOrdinal(), "Stamped.");
        var note = await Body(response);

        Assert.Equal(app.Clock.GetUtcNow(), note.CreatedAt);
        Assert.Equal(note.CreatedAt, note.ModifiedAt);
    }

    [Fact]
    public async Task ACreatedNote_AppearsInAGetForAWindowContainingIt()
    {
        var ordinal = FreshOrdinal();

        await Put("s1", WriteDay, ordinal, "Readable.");

        Assert.Contains(
            await Get("s1", WriteDay),
            note => note.PeriodOrdinal == ordinal && note.Content == "Readable.");
    }

    [Fact]
    public async Task Returns200WithTheNewContent_WhenThePeriodAlreadyHeldANote()
    {
        var ordinal = FreshOrdinal();
        await Put("s1", WriteDay, ordinal, "First.");

        var response = await Put("s1", WriteDay, ordinal, "Second.");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Second.", (await Body(response)).Content);
    }

    /// <summary>Last-write-wins, decided: the second write is simply the one that stands.</summary>
    [Fact]
    public async Task AppliesTwoWritesInARow()
    {
        var ordinal = FreshOrdinal();

        await Put("s1", WriteDay, ordinal, "First.");
        await Put("s1", WriteDay, ordinal, "Second.");

        var note = Assert.Single(await Get("s1", WriteDay), note => note.PeriodOrdinal == ordinal);
        Assert.Equal("Second.", note.Content);
    }

    /// <summary>The property the whole design rests on, asserted directly.</summary>
    [Fact]
    public async Task TheIdenticalRequestSentTwice_Gives201Then200AndLeavesOneNote()
    {
        var ordinal = FreshOrdinal();

        var first = await Put("s1", WriteDay, ordinal, "Same.");
        var second = await Put("s1", WriteDay, ordinal, "Same.");

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Single(await Get("s1", WriteDay), note => note.PeriodOrdinal == ordinal);
    }

    /// <summary>The request already names the address it wrote to.</summary>
    [Fact]
    public async Task SendsNoLocationHeader()
    {
        var response = await Put("s1", WriteDay, FreshOrdinal(), "Created.");

        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public async Task Returns201WithEmptyContent_BecauseSavingTheClearingDependsOnIt()
    {
        var response = await Put("s1", WriteDay, FreshOrdinal(), string.Empty);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task AnEmptyNote_IsNotReturnedByTheListOrTheCounts()
    {
        var ordinal = FreshOrdinal();

        await Put("s1", WriteDay, ordinal, string.Empty);

        Assert.DoesNotContain(await Get("s1", WriteDay), note => note.PeriodOrdinal == ordinal);
    }

    [Theory]
    [InlineData("s3", 9)]
    [InlineData("s3", 0)]
    [InlineData("s1", 25)]
    [InlineData("s6", 5)]
    public async Task Returns400_ForAnOrdinalTheScheduleDoesNotHave(string schedule, int ordinal)
    {
        var response = await Put(schedule, WriteDay, ordinal, "Out of range.");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("s99")]
    [InlineData("s2")]
    [InlineData("nonsense")]
    public async Task Returns400NamingTheSchedule_WhenItIsNotOneTheAppOffers(string schedule)
    {
        var response = await Put(schedule, WriteDay, 1, "Unknown schedule.");
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("schedule", body, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("not-a-date")]
    [InlineData("2026-13-45")]
    public async Task Returns400_WhenTheDayIsNotACalendarDate(string day)
    {
        var response = await app.Client.PutAsJsonAsync(
            $"/api/schedules/s1/notes/{day}/p1",
            new { content = "Bad day." },
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Returns400NamingContent_WhenItIsNull()
    {
        var response = await Put("s1", WriteDay, FreshOrdinal(), (string?)null);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("content", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Returns400_WhenContentIsLongerThanTheMaximum()
    {
        var tooLong = new string('a', UpsertNoteValidator.MaximumContentLength + 1);

        var response = await Put("s1", WriteDay, FreshOrdinal(), tooLong);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AcceptsContentOfExactlyTheMaximum()
    {
        var atTheLimit = new string('a', UpsertNoteValidator.MaximumContentLength);

        var response = await Put("s1", WriteDay, FreshOrdinal(), atTheLimit);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    /// <summary>The Schedule is part of the address, so there is no cross-Schedule case to guard.</summary>
    [Fact]
    public async Task TheSamePeriodUnderTwoSchedules_IsTwoIndependentNotes()
    {
        var ordinal = FreshOrdinal();

        await Put("s1", WriteDay, ordinal, "Hourly.");
        await Put("s3", WriteDay, 4, "Three-hourly.");

        Assert.Equal(
            "Hourly.",
            Assert.Single(await Get("s1", WriteDay), note => note.PeriodOrdinal == ordinal).Content);
        Assert.Equal(
            "Three-hourly.",
            Assert.Single(await Get("s3", WriteDay), note => note.PeriodOrdinal == 4).Content);
    }

    /// <summary>The slot is the address: the body cannot move a note, because it cannot name one.</summary>
    [Fact]
    public async Task IgnoresADayOrdinalOrStampSentInTheBody()
    {
        var ordinal = FreshOrdinal();

        var response = await Put("s1", WriteDay, ordinal, new
        {
            content = "Body ignored.",
            day = "1999-01-01",
            periodOrdinal = 23,
            createdAt = "1999-01-01T00:00:00+00:00",
            modifiedAt = "1999-01-01T00:00:00+00:00"
        });
        var note = await Body(response);

        Assert.Equal(WriteDay, note.Day);
        Assert.Equal(ordinal, note.PeriodOrdinal);
        Assert.Equal(app.Clock.GetUtcNow(), note.CreatedAt);
    }
    /// <summary>
    /// The defect this replaced: under the earlier <c>p{ordinal}</c> route the router split the
    /// sigil off and <c>int.TryParse</c> took the rest, so all three of these reached the note
    /// <c>p4</c> had created — one note, four URLs. A period now has one spelling, like a Schedule.
    /// </summary>
    [Theory]
    [InlineData("p04")]
    [InlineData("p+4")]
    [InlineData("P4")]
    [InlineData("p 4")]
    public async Task Returns400_ForAnySpellingOfAPeriodButTheOne(string period)
    {
        var ordinal = FreshOrdinal();
        await Put("s1", WriteDay, ordinal, "The one spelling.");

        var response = await app.Client.PutAsJsonAsync(
            $"/api/schedules/s1/notes/{WriteDay:yyyy-MM-dd}/{period}",
            new { content = "An alias." },
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    /// <summary>And the note those aliases used to reach is untouched, which is what was at stake.</summary>
    [Fact]
    public async Task AnAliasSpelling_ReachesNoNoteAtAll()
    {
        var ordinal = FreshOrdinal();
        await Put("s1", WriteDay, ordinal, "The one spelling.");

        await app.Client.PutAsJsonAsync(
            $"/api/schedules/s1/notes/{WriteDay:yyyy-MM-dd}/p0{ordinal}",
            new { content = "An alias." },
            TestContext.Current.CancellationToken);

        var note = Assert.Single(await Get("s1", WriteDay), note => note.PeriodOrdinal == ordinal);
        Assert.Equal("The one spelling.", note.Content);
    }

    /// <summary>A period is a period *of a Schedule*: the same spelling is valid under s1 and not s3.</summary>
    [Fact]
    public async Task ReadsOneSpellingAgainstTheScheduleTheUrlNames()
    {
        // Its own day: p9 is outside FreshOrdinal's reach only by luck, and this asserts a 201.
        var day = WriteDay.AddDays(1);

        var hourly = await Put("s1", day, 9, "p9 is a period of s1.");
        var threeHourly = await Put("s3", day, 9, "p9 is not a period of s3.");

        Assert.Equal(HttpStatusCode.Created, hourly.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, threeHourly.StatusCode);
    }

    [Fact]
    public async Task Returns400NamingThePeriod_WhenItIsNotOneTheScheduleHas()
    {
        var response = await Put("s3", WriteDay, 9, "Out of range.");
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("period", body, StringComparison.OrdinalIgnoreCase);
    }
}
