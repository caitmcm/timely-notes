using System.Net;
using System.Net.Http.Json;
using FastEndpoints.Testing;
using TimelyNotes.API.Endpoints.Notes;

namespace TimelyNotes.API.Tests.Endpoints.Notes;

public class ApiFixture : AppFixture<Program>;

public class GetNotesByScheduleEndpointTests(ApiFixture app) : TestBase<ApiFixture>
{
    private static readonly DateTimeOffset Today = new(DateTime.Today, DateTimeOffset.Now.Offset);

    private static DateTimeOffset Day(int offsetInDays) => Today.AddDays(offsetInDays);

    /// <summary>Percent-encoded so the offsets survive the query string.</summary>
    private static string Route(string scheduleShortName, DateTimeOffset searchFrom, DateTimeOffset searchTo) =>
        $"/api/schedules/{scheduleShortName}/notes"
        + $"?searchFrom={Uri.EscapeDataString(searchFrom.ToString("O"))}"
        + $"&searchTo={Uri.EscapeDataString(searchTo.ToString("O"))}";

    private async Task<(HttpResponseMessage Response, List<NoteResponse> Notes)> Get(
        string scheduleShortName, DateTimeOffset searchFrom, DateTimeOffset searchTo)
    {
        var response = await app.Client.GetAsync(
            Route(scheduleShortName, searchFrom, searchTo), TestContext.Current.CancellationToken);

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
            Assert.NotEqual(Guid.Empty, note.Id);
            Assert.False(string.IsNullOrWhiteSpace(note.Content));
            Assert.NotEqual(default, note.OccursAt);
            Assert.NotEqual(default, note.CreatedAt);
            Assert.NotEqual(default, note.ModifiedAt);
        });
    }

    [Fact]
    public async Task ReturnsNotesNewestFirstByOccursAt()
    {
        var (_, notes) = await Get("s1", Day(-3), Day(4));

        Assert.Equal(notes.OrderByDescending(note => note.OccursAt), notes);
    }

    [Theory]
    [InlineData("s1")]
    [InlineData("s3")]
    [InlineData("s6")]
    public async Task ReturnsNotesForEverySeededSchedule(string scheduleShortName)
    {
        var (response, notes) = await Get(scheduleShortName, Day(-3), Day(4));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEmpty(notes);
    }

    [Fact]
    public async Task Returns200WithAnEmptyListForAnUnknownSchedule()
    {
        var (response, notes) = await Get("s99", Day(-3), Day(4));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(notes);
    }

    [Fact]
    public async Task ReturnsOnlyTheNotesInsideTheRequestedWindow()
    {
        var (response, notes) = await Get("s1", Today, Day(1));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEmpty(notes);
        Assert.All(notes, note => Assert.Equal(DateTime.Today, note.OccursAt.LocalDateTime.Date));
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
        var (_, earlier) = await Get("s1", Day(-3), Day(0));
        var (_, later) = await Get("s1", Day(0), Day(3));

        Assert.NotEmpty(earlier);
        Assert.NotEmpty(later);
        Assert.Empty(earlier.Select(note => note.Id).Intersect(later.Select(note => note.Id)));
    }

    [Fact]
    public async Task Returns400WhenSearchFromIsMissing()
    {
        var response = await app.Client.GetAsync(
            $"/api/schedules/s1/notes?searchTo={Uri.EscapeDataString(Day(1).ToString("O"))}",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Returns400WhenSearchToIsMissing()
    {
        var response = await app.Client.GetAsync(
            $"/api/schedules/s1/notes?searchFrom={Uri.EscapeDataString(Today.ToString("O"))}",
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Returns400WhenBothParametersAreMissing()
    {
        var response = await app.Client.GetAsync(
            "/api/schedules/s1/notes", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Returns400WhenAParameterIsUnparseable()
    {
        var response = await app.Client.GetAsync(
            $"/api/schedules/s1/notes?searchFrom=not-a-date&searchTo={Uri.EscapeDataString(Day(1).ToString("O"))}",
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
