using System.Net;
using FastEndpoints.Testing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using TimelyNotes.API.Tests.Endpoints.Notes;

namespace TimelyNotes.API.Tests;

public class ProgramTests(ApiFixture app) : TestBase<ApiFixture>
{
    /// <summary>The seam that makes a server-set timestamp assertable rather than "roughly now".</summary>
    [Fact]
    public void RegistersTimeProviderSoHandlersNeverReadTheClockDirectly()
    {
        var clock = app.Services.GetService<TimeProvider>();

        Assert.Same(TimeProvider.System, clock);
    }
}

/// <summary>Swagger is mapped in Development only, which no other fixture runs as.</summary>
public class DevelopmentApiFixture : AppFixture<Program>
{
    protected override void ConfigureApp(IWebHostBuilder builder) =>
        builder.UseEnvironment(Environments.Development);
}

public class DevelopmentProgramTests(DevelopmentApiFixture app) : TestBase<DevelopmentApiFixture>
{
    /// <summary>The integrated lane's readiness URL, so it never needs a token.</summary>
    [Fact]
    public async Task SwaggerIsReachableAnonymously_AndDeclaresTheBearerScheme()
    {
        var page = await app.Client.GetAsync(
            "/swagger/index.html", TestContext.Current.CancellationToken);
        var document = await app.Client.GetStringAsync(
            "/swagger/v1/swagger.json", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        Assert.Contains("\"securitySchemes\"", document);
        Assert.Contains("\"scheme\": \"Bearer\"", document);
    }
}
