using System.Net;
using System.Net.Http.Json;
using FastEndpoints.Testing;
using TimelyNotes.API.Endpoints.Notes;

namespace TimelyNotes.API.Tests.Endpoints.Notes;

public class ApiFixture : AppFixture<Program>;

public class GetNotesByScheduleEndpointTests(ApiFixture app) : TestBase<ApiFixture>
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.Today);

    private static DateOnly Day(int offsetInDays) => Today.AddDays(offsetInDays);

    /// <summary>A date needs no escaping — that is the point of the format.</summary>
    private static string Route(string schedule, DateOnly searchFrom, DateOnly searchTo) =>
        $"/api/schedules/{schedule}/notes"
        + $"?searchFrom={searchFrom:yyyy-MM-dd}"
        + $"&searchTo={searchTo:yyyy-MM-dd}";

    private async Task<(HttpResponseMessage Response, List<NoteResponse> Notes)> Get(
        string schedule, DateOnly searchFrom, DateOnly searchTo)
    {
        var response = await app.Client.GetAsync(
            Route(schedule, searchFrom, searchTo), TestContext.Current.CancellationToken);

        if (response.StatusCode != HttpStatusCode.OK)
        {
            return (response, []);
        }

        var notes = await response.Content.ReadFromJsonAsync<List<NoteResponse>>(
            TestContext.Current.CancellationToken);

        return (response, notes!);
    }

    [Fact]
    public async Task Returns200WithTheSeededNotesForTheSchedule()
    {
        var (response, notes) = await Get("s1", Day(-3), Day(4));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEmpty(notes);
        Assert.All(notes, note =>
        {
            Assert.NotEqual(default, note.Day);
            Assert.True(note.PeriodOrdinal >= 1);
            Assert.False(string.IsNullOrWhiteSpace(note.Content));
            Assert.NotEqual(default, note.CreatedAt);
            Assert.NotEqual(default, note.ModifiedAt);
        });
    }

    /// <summary>The response body is the whole contract: no surrogate id, no instant.</summary>
    [Fact]
    public async Task CarriesNeitherAnIdNorAnOccursAt()
    {
        var response = await app.Client.GetAsync(
            Route("s1", Day(-3), Day(4)), TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.DoesNotContain("\"id\"", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("occursAt", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ReturnsNotesNewestFirstByDayThenPeriodOrdinal()
    {
        var (_, notes) = await Get("s1", Day(-3), Day(4));

        Assert.Equal(
            notes.OrderByDescending(note => note.Day).ThenByDescending(note => note.PeriodOrdinal),
            notes);
    }

    [Theory]
    [InlineData("s1")]
    [InlineData("s3")]
    [InlineData("s6")]
    public async Task ReturnsNotesForEverySeededSchedule(string schedule)
    {
        var (response, notes) = await Get(schedule, Day(-3), Day(4));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEmpty(notes);
    }

    [Theory]
    [InlineData("s99")]
    [InlineData("s2")]
    [InlineData("1")]
    [InlineData("nonsense")]
    public async Task Returns400NamingTheScheduleWhenItIsNotOneTheAppOffers(string schedule)
    {
        var response = await app.Client.GetAsync(
            Route(schedule, Day(-3), Day(4)), TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("schedule", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ReturnsOnlyTheNotesInsideTheRequestedWindow()
    {
        var (response, notes) = await Get("s1", Today, Day(1));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEmpty(notes);
        Assert.All(notes, note => Assert.Equal(Today, note.Day));
    }

    [Fact]
    public async Task ReturnsAnEmptyListForAWindowHoldingNoNotes()
    {
        var (response, notes) = await Get("s1", Day(300), Day(301));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(notes);
    }

    [Fact]
    public async Task AdjacentWindowsNeverReturnTheSameNoteTwice()
    {
        var (_, earlier) = await Get("s1", Day(-3), Today);
        var (_, later) = await Get("s1", Today, Day(3));

        Assert.NotEmpty(earlier);
        Assert.NotEmpty(later);
        Assert.Empty(
            earlier.Select(note => (note.Day, note.PeriodOrdinal))
                .Intersect(later.Select(note => (note.Day, note.PeriodOrdinal))));
    }

    [Fact]
    public async Task Returns400NamingSearchFromWhenItIsMissing()
    {
        var response = await app.Client.GetAsync(
            $"/api/schedules/s1/notes?searchTo={Day(1):yyyy-MM-dd}",
            TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("searchFrom", body);
    }

    [Fact]
    public async Task Returns400NamingSearchToWhenItIsMissing()
    {
        var response = await app.Client.GetAsync(
            $"/api/schedules/s1/notes?searchFrom={Today:yyyy-MM-dd}",
            TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("searchTo", body);
    }

    [Fact]
    public async Task Returns400WhenBothParametersAreMissing()
    {
        var response = await app.Client.GetAsync(
            "/api/schedules/s1/notes", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    /// <summary>Rejected by the binder rather than the validator, so the message is FastEndpoints'.</summary>
    [Theory]
    [InlineData("not-a-date")]
    [InlineData("2026-13-45")]
    [InlineData("2026-08-27T00:00:00%2B01:00")]
    public async Task Returns400WhenABoundIsNotACalendarDate(string searchFrom)
    {
        var response = await app.Client.GetAsync(
            $"/api/schedules/s1/notes?searchFrom={searchFrom}&searchTo={Day(1):yyyy-MM-dd}",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Returns400WhenSearchToEqualsSearchFrom()
    {
        var (response, _) = await Get("s1", Today, Today);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Returns400WhenSearchToIsBeforeSearchFrom()
    {
        var (response, _) = await Get("s1", Day(1), Today);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Returns400WhenTheRangeIsLongerThanSevenDays()
    {
        var (response, _) = await Get("s1", Today, Day(8));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Returns200ForARangeOfExactlySevenDays()
    {
        var (response, _) = await Get("s1", Day(-3), Day(4));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task IsMappedToTheSchedulesNotesRoute()
    {
        var response = await app.Client.GetAsync(
            Route("s1", Today, Day(1)), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
