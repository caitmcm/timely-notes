using FastEndpoints.Testing;
using Microsoft.Extensions.DependencyInjection;
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
