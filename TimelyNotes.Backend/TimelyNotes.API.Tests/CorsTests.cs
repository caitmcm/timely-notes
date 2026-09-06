using System.Net;
using System.Net.Http.Headers;
using FastEndpoints.Testing;
using Microsoft.AspNetCore.Hosting;

namespace TimelyNotes.API.Tests;

/// <summary>The deployed UI is on another origin, so its own is the one allow-listed.</summary>
public class CorsFixture : AppFixture<Program>
{
    public const string AllowedOrigin = "https://ui.example.net";

    protected override void ConfigureApp(IWebHostBuilder builder) =>
        builder.UseSetting("Cors:AllowedOrigins:0", AllowedOrigin);
}

public class CorsTests(CorsFixture app) : TestBase<CorsFixture>
{
    private const string Route = "/api/schedules/s1/notes?searchFrom=2026-08-25&searchTo=2026-08-26";

    private async Task<HttpResponseMessage> Get(string origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, Route);
        request.Headers.Add("Origin", origin);

        return await app.Client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task AllowsTheConfiguredUiOrigin()
    {
        var response = await Get(CorsFixture.AllowedOrigin);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(
            CorsFixture.AllowedOrigin,
            Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
    }

    [Fact]
    public async Task AnswersThePreflightForTheConfiguredOrigin()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, Route);
        request.Headers.Add("Origin", CorsFixture.AllowedOrigin);
        request.Headers.Add("Access-Control-Request-Method", "GET");

        var response = await app.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(
            CorsFixture.AllowedOrigin,
            Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
    }

    [Fact]
    public async Task GrantsNothingToAnOriginThatIsNotAllowListed()
    {
        var response = await Get("https://not-the-ui.example.net");

        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }
}
