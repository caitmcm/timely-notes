using System.Net;
using System.Net.Http.Json;
using FastEndpoints.Testing;
using TimelyNotes.API.Endpoints.Notes;

namespace TimelyNotes.API.Tests.Endpoints.Notes;

/// <summary>Its own app: these tests write as several users.</summary>
public class TenancyApiFixture : SignedInAppFixture;

public class NoteTenancyEndpointTests(TenancyApiFixture app) : TestBase<TenancyApiFixture>
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.Today);

    private static string NoteRoute(string schedule, DateOnly day, int ordinal) =>
        $"/api/schedules/{schedule}/notes/{day:yyyy-MM-dd}/p{ordinal}";

    private static string NotesRoute(string schedule, DateOnly day) =>
        $"/api/schedules/{schedule}/notes?searchFrom={day:yyyy-MM-dd}&searchTo={day.AddDays(1):yyyy-MM-dd}";

    private static string NoteDaysRoute(string schedule, DateOnly day) =>
        $"/api/schedules/{schedule}/note-days?searchFrom={day:yyyy-MM-dd}&searchTo={day.AddDays(1):yyyy-MM-dd}";

    public static TheoryData<string, string> EveryRoute(string schedule) => new()
    {
        { "GET", NotesRoute(schedule, Today) },
        { "GET", NoteDaysRoute(schedule, Today) },
        { "PUT", NoteRoute(schedule, Today, 4) },
        { "DELETE", NoteRoute(schedule, Today, 4) }
    };

    [Theory]
    [MemberData(nameof(EveryRoute), "s3")]
    public async Task EveryRouteAnswers401WithoutCredentials(string method, string route)
    {
        var response = await Send(app.AnonymousClient(), method, route);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /// <summary>An anonymous caller learns nothing about what the routes accept.</summary>
    [Theory]
    [MemberData(nameof(EveryRoute), "s5")]
    public async Task AMalformedRequestWithoutCredentialsIs401Not400(string method, string route)
    {
        var response = await Send(app.AnonymousClient(), method, route);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task TwoUsersWritingTheSameAddress_EachGetTheirOwnNote()
    {
        var day = Today.AddDays(210);
        var alice = app.ClientFor("alice-tenancy");
        var bob = app.ClientFor("bob-tenancy");

        var alicesWrite = await Put(alice, NoteRoute("s3", day, 4), "Alice's.");
        var bobsWrite = await Put(bob, NoteRoute("s3", day, 4), "Bob's.");

        Assert.Equal(HttpStatusCode.Created, alicesWrite.StatusCode);
        Assert.Equal(HttpStatusCode.Created, bobsWrite.StatusCode);
        Assert.Equal("Alice's.", Assert.Single(await Notes(alice, day)).Content);
        Assert.Equal("Bob's.", Assert.Single(await Notes(bob, day)).Content);
    }

    [Fact]
    public async Task NoteDaysCountsOnlyTheCallersNotes()
    {
        var day = Today.AddDays(220);
        var alice = app.ClientFor("alice-days");
        var bob = app.ClientFor("bob-days");
        await Put(alice, NoteRoute("s3", day, 4), "Alice's.");
        await Put(alice, NoteRoute("s3", day, 5), "Alice's too.");
        await Put(bob, NoteRoute("s3", day, 4), "Bob's.");

        var bobsDays = await bob.GetFromJsonAsync<List<NoteDayResponse>>(
            NoteDaysRoute("s3", day), TestContext.Current.CancellationToken);
        var alicesDays = await alice.GetFromJsonAsync<List<NoteDayResponse>>(
            NoteDaysRoute("s3", day), TestContext.Current.CancellationToken);

        Assert.Equal(1, Assert.Single(bobsDays!).Count);
        Assert.Equal(2, Assert.Single(alicesDays!).Count);
    }

    /// <summary>404, not 403: nothing confirms that another user's note exists.</summary>
    [Fact]
    public async Task DeletingAnAddressOnlyAnotherUserHolds_Is404_AndLeavesTheirNote()
    {
        var day = Today.AddDays(230);
        var alice = app.ClientFor("alice-delete");
        var bob = app.ClientFor("bob-delete");
        await Put(alice, NoteRoute("s3", day, 4), "Alice's.");

        var response = await bob.DeleteAsync(
            NoteRoute("s3", day, 4), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Alice's.", Assert.Single(await Notes(alice, day)).Content);
    }

    /// <summary>The user comes from the token alone; a body naming another is not listened to.</summary>
    [Fact]
    public async Task AUserIdInTheBodyIsIgnored()
    {
        var day = Today.AddDays(250);
        var alice = app.ClientFor("alice-smuggle");

        await alice.PutAsJsonAsync(
            NoteRoute("s3", day, 4),
            new { content = "Alice's.", userId = Guid.CreateVersion7() },
            TestContext.Current.CancellationToken);

        Assert.Equal("Alice's.", Assert.Single(await Notes(alice, day)).Content);
    }

    [Fact]
    public async Task NoResponseBodyCarriesAUser()
    {
        var day = Today.AddDays(240);
        var alice = app.ClientFor("alice-body");

        var bodies = new[]
        {
            await (await Put(alice, NoteRoute("s3", day, 4), "Alice's.")).Content
                .ReadAsStringAsync(TestContext.Current.CancellationToken),
            await alice.GetStringAsync(NotesRoute("s3", day), TestContext.Current.CancellationToken),
            await alice.GetStringAsync(NoteDaysRoute("s3", day), TestContext.Current.CancellationToken)
        };

        Assert.All(bodies, body =>
        {
            Assert.NotEqual("[]", body);
            Assert.DoesNotContain("user", body, StringComparison.OrdinalIgnoreCase);
        });
    }

    private static Task<HttpResponseMessage> Put(HttpClient client, string route, string content) =>
        client.PutAsJsonAsync(route, new { content }, TestContext.Current.CancellationToken);

    private static async Task<List<NoteResponse>> Notes(HttpClient client, DateOnly day) =>
        (await client.GetFromJsonAsync<List<NoteResponse>>(
            NotesRoute("s3", day), TestContext.Current.CancellationToken))!;

    private static Task<HttpResponseMessage> Send(HttpClient client, string method, string route)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), route);

        if (method == "PUT")
        {
            request.Content = JsonContent.Create(new { content = "Anyone's." });
        }

        return client.SendAsync(request, TestContext.Current.CancellationToken);
    }
}
