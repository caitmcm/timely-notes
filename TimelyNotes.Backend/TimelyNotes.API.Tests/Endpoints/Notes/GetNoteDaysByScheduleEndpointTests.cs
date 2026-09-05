using System.Net;
using System.Net.Http.Json;
using FastEndpoints.Testing;
using TimelyNotes.API.Endpoints.Notes;

namespace TimelyNotes.API.Tests.Endpoints.Notes;

public class GetNoteDaysByScheduleEndpointTests(ApiFixture app) : TestBase<ApiFixture>
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.Today);

    private static DateOnly Day(int offsetInDays) => Today.AddDays(offsetInDays);

    private static string Route(string schedule, DateOnly searchFrom, DateOnly searchTo) =>
        $"/api/schedules/{schedule}/note-days"
        + $"?searchFrom={searchFrom:yyyy-MM-dd}"
        + $"&searchTo={searchTo:yyyy-MM-dd}";

    private async Task<(HttpResponseMessage Response, List<NoteDayResponse> Days)> Get(
        string schedule, DateOnly searchFrom, DateOnly searchTo)
    {
        var response = await app.Client.GetAsync(
            Route(schedule, searchFrom, searchTo), TestContext.Current.CancellationToken);

        if (response.StatusCode != HttpStatusCode.OK)
        {
            return (response, []);
        }

        var days = await response.Content.ReadFromJsonAsync<List<NoteDayResponse>>(
            TestContext.Current.CancellationToken);

        return (response, days!);
    }

    [Fact]
    public async Task Returns200WithACountForEverySeededDay()
    {
        var (response, days) = await Get("s1", Day(-4), Day(4));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEmpty(days);
        Assert.All(days, day => Assert.True(day.Count > 0));
    }

    [Fact]
    public async Task CountsEveryNoteOnADayAndReportsThatDay()
    {
        var (_, days) = await Get("s1", Today, Day(1));

        var today = Assert.Single(days);
        Assert.Equal(Today, today.Day);
        Assert.Equal(2, today.Count);
    }

    /// <summary>A plain date on the wire: no offset to reinterpret it by.</summary>
    [Fact]
    public async Task ReportsEachDayAsAPlainCalendarDate()
    {
        var response = await app.Client.GetAsync(
            Route("s1", Today, Day(1)), TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Contains($"\"{Today:yyyy-MM-dd}\"", body);
    }

    [Fact]
    public async Task ReturnsDaysAscending()
    {
        var (_, days) = await Get("s1", Day(-4), Day(4));

        Assert.Equal(days.OrderBy(day => day.Day), days);
    }

    [Fact]
    public async Task OmitsDaysWithNoNotes()
    {
        var (_, days) = await Get("s1", Day(-4), Day(4));

        Assert.DoesNotContain(days, day => day.Day == Day(2));
    }

    [Fact]
    public async Task IsScopedToTheSchedule()
    {
        var (_, s1) = await Get("s1", Today, Day(1));
        var (_, s3) = await Get("s3", Today, Day(1));

        Assert.Equal(2, s1.Sum(day => day.Count));
        Assert.Equal(2, s3.Sum(day => day.Count));
    }

    [Theory]
    [InlineData("s99")]
    [InlineData("s2")]
    [InlineData("1")]
    [InlineData("nonsense")]
    public async Task Returns400NamingTheScheduleWhenItIsNotOneTheAppOffers(string schedule)
    {
        var response = await app.Client.GetAsync(
            Route(schedule, Day(-4), Day(4)), TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("schedule", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Returns400NamingSearchFromWhenItIsMissing()
    {
        var response = await app.Client.GetAsync(
            $"/api/schedules/s1/note-days?searchTo={Day(1):yyyy-MM-dd}",
            TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("searchFrom", body);
    }

    [Fact]
    public async Task Returns400NamingSearchToWhenItIsMissing()
    {
        var response = await app.Client.GetAsync(
            $"/api/schedules/s1/note-days?searchFrom={Today:yyyy-MM-dd}",
            TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("searchTo", body);
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
    public async Task Returns400WhenTheRangeIsLongerThanFortyTwoDays()
    {
        var (response, _) = await Get("s1", Today, Day(43));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Returns200ForARangeOfExactlyFortyTwoDays()
    {
        var (response, _) = await Get("s1", Day(-21), Day(21));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
