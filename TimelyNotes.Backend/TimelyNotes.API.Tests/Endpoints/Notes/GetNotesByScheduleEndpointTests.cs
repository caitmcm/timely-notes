using System.Net;
using FastEndpoints;
using FastEndpoints.Testing;
using TimelyNotes.API.Endpoints.Notes;

namespace TimelyNotes.API.Tests.Endpoints.Notes;

public class ApiFixture : AppFixture<Program>;

public class GetNotesByScheduleEndpointTests(ApiFixture app) : TestBase<ApiFixture>
{
    [Fact]
    public async Task Returns200WithTheSeededNotesForTheSchedule()
    {
        var (response, notes) = await app.Client
            .GETAsync<GetNotesByScheduleEndpoint, GetNotesByScheduleRequest, List<NoteResponse>>(
                new() { ScheduleShortName = "s1" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEmpty(notes);
        Assert.All(notes, note =>
        {
            Assert.NotEqual(Guid.Empty, note.Id);
            Assert.False(string.IsNullOrWhiteSpace(note.Content));
            Assert.NotEqual(default, note.CreatedAt);
            Assert.NotEqual(default, note.ModifiedAt);
        });
    }

    [Fact]
    public async Task ReturnsNotesNewestFirst()
    {
        var (_, notes) = await app.Client
            .GETAsync<GetNotesByScheduleEndpoint, GetNotesByScheduleRequest, List<NoteResponse>>(
                new() { ScheduleShortName = "s1" });

        Assert.Equal(notes.OrderByDescending(note => note.CreatedAt), notes);
    }

    [Theory]
    [InlineData("s1")]
    [InlineData("s3")]
    [InlineData("s6")]
    public async Task ReturnsNotesForEverySeededSchedule(string scheduleShortName)
    {
        var (response, notes) = await app.Client
            .GETAsync<GetNotesByScheduleEndpoint, GetNotesByScheduleRequest, List<NoteResponse>>(
                new() { ScheduleShortName = scheduleShortName });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEmpty(notes);
    }

    [Fact]
    public async Task Returns200WithAnEmptyListForAnUnknownSchedule()
    {
        var (response, notes) = await app.Client
            .GETAsync<GetNotesByScheduleEndpoint, GetNotesByScheduleRequest, List<NoteResponse>>(
                new() { ScheduleShortName = "s99" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(notes);
    }

    [Fact]
    public async Task IsMappedToTheSchedulesNotesRoute()
    {
        var response = await app.Client.GetAsync("/api/schedules/s1/notes", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
