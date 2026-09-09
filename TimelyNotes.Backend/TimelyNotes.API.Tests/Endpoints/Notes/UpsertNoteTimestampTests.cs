using System.Net.Http.Json;
using FastEndpoints.Testing;
using TimelyNotes.API.Endpoints.Notes;

namespace TimelyNotes.API.Tests.Endpoints.Notes;

/// <summary>Alone with its fixture, because it moves the clock the other write tests read.</summary>
public class UpsertNoteTimestampTests(AdvancingApiFixture app) : TestBase<AdvancingApiFixture>
{
    private static readonly DateOnly WriteDay = DateOnly.FromDateTime(DateTime.Today).AddDays(700);

    private Task<HttpResponseMessage> Put(int ordinal, string content) =>
        app.Client.PutAsJsonAsync(
            $"/api/schedules/s1/notes/{WriteDay:yyyy-MM-dd}/p{ordinal}",
            new { content },
            TestContext.Current.CancellationToken);

    private static async Task<NoteResponse> Body(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<NoteResponse>(
            TestContext.Current.CancellationToken))!;

    [Fact]
    public async Task AdvancesModifiedAtButNotCreatedAt_OnReplace()
    {
        var created = await Body(await Put(1, "First."));

        app.Clock.Advance(TimeSpan.FromMinutes(5));
        var replaced = await Body(await Put(1, "Second."));

        Assert.Equal(created.CreatedAt, replaced.CreatedAt);
        Assert.Equal(app.Clock.GetUtcNow(), replaced.ModifiedAt);
        Assert.True(replaced.ModifiedAt > replaced.CreatedAt);
        Assert.Equal(created.Day, replaced.Day);
        Assert.Equal(created.PeriodOrdinal, replaced.PeriodOrdinal);
    }
}
