using System.Net;
using System.Net.Http.Json;
using FastEndpoints.Testing;
using TimelyNotes.API.Endpoints.Notes;

namespace TimelyNotes.API.Tests.Endpoints.Notes;

public class DeleteNoteEndpointTests(WriteApiFixture app) : TestBase<WriteApiFixture>
{
    /// <summary>Far from the seed, and from the upsert tests' day, so nothing collides.</summary>
    private static readonly DateOnly WriteDay = DateOnly.FromDateTime(DateTime.Today).AddDays(600);

    private static int _nextOrdinal = 1;

    private static int FreshOrdinal() => Interlocked.Increment(ref _nextOrdinal);

    private static string Route(string schedule, DateOnly day, int ordinal) =>
        $"/api/schedules/{schedule}/notes/{day:yyyy-MM-dd}/p{ordinal}";

    private Task<HttpResponseMessage> Put(string schedule, DateOnly day, int ordinal, string content) =>
        app.Client.PutAsJsonAsync(
            Route(schedule, day, ordinal), new { content }, TestContext.Current.CancellationToken);

    private Task<HttpResponseMessage> Delete(string schedule, DateOnly day, int ordinal) =>
        app.Client.DeleteAsync(Route(schedule, day, ordinal), TestContext.Current.CancellationToken);

    private async Task<List<NoteResponse>> Get(string schedule, DateOnly day)
    {
        var response = await app.Client.GetAsync(
            $"/api/schedules/{schedule}/notes?searchFrom={day:yyyy-MM-dd}"
            + $"&searchTo={day.AddDays(1):yyyy-MM-dd}",
            TestContext.Current.CancellationToken);

        return (await response.Content.ReadFromJsonAsync<List<NoteResponse>>(
            TestContext.Current.CancellationToken))!;
    }

    private async Task<List<NoteDayResponse>> GetDays(string schedule, DateOnly day)
    {
        var response = await app.Client.GetAsync(
            $"/api/schedules/{schedule}/note-days?searchFrom={day:yyyy-MM-dd}"
            + $"&searchTo={day.AddDays(1):yyyy-MM-dd}",
            TestContext.Current.CancellationToken);

        return (await response.Content.ReadFromJsonAsync<List<NoteDayResponse>>(
            TestContext.Current.CancellationToken))!;
    }

    [Fact]
    public async Task Returns204AndRemovesTheNoteFromBothReadRoutes()
    {
        var ordinal = FreshOrdinal();
        await Put("s1", WriteDay, ordinal, "Doomed.");

        var response = await Delete("s1", WriteDay, ordinal);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.DoesNotContain(await Get("s1", WriteDay), note => note.PeriodOrdinal == ordinal);
        Assert.Empty(await GetDays("s1", WriteDay));
    }

    [Fact]
    public async Task Returns404_ForAPeriodHoldingNoNote()
    {
        var response = await Delete("s1", WriteDay, FreshOrdinal());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task DeletingTwice_Gives204Then404()
    {
        var ordinal = FreshOrdinal();
        await Put("s1", WriteDay, ordinal, "Doomed.");

        var first = await Delete("s1", WriteDay, ordinal);
        var second = await Delete("s1", WriteDay, ordinal);

        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, second.StatusCode);
    }

    /// <summary>Autosave's undo: an emptied note is still a record, and delete is what reclaims it.</summary>
    [Fact]
    public async Task RemovesAnEmptyNote()
    {
        var ordinal = FreshOrdinal();
        await Put("s1", WriteDay, ordinal, string.Empty);

        Assert.Equal(HttpStatusCode.NoContent, (await Delete("s1", WriteDay, ordinal)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Delete("s1", WriteDay, ordinal)).StatusCode);
    }

    [Fact]
    public async Task LeavesTheSamePeriodUnderAnotherScheduleUntouched()
    {
        var ordinal = FreshOrdinal();
        await Put("s1", WriteDay, ordinal, "Hourly.");
        await Put("s3", WriteDay, 4, "Three-hourly.");

        await Delete("s1", WriteDay, ordinal);

        Assert.Equal(
            "Three-hourly.",
            Assert.Single(await Get("s3", WriteDay), note => note.PeriodOrdinal == 4).Content);
    }

    [Theory]
    [InlineData("s3", 9)]
    [InlineData("s3", 0)]
    public async Task Returns400_ForAnOrdinalTheScheduleDoesNotHave(string schedule, int ordinal)
    {
        var response = await Delete(schedule, WriteDay, ordinal);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Returns400NamingTheSchedule_WhenItIsNotOneTheAppOffers()
    {
        var response = await Delete("s99", WriteDay, 1);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("schedule", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Returns400_WhenTheDayIsNotACalendarDate()
    {
        var response = await app.Client.DeleteAsync(
            "/api/schedules/s1/notes/not-a-date/p1", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
