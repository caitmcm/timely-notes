using FastEndpoints.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;

namespace TimelyNotes.API.Tests.Endpoints.Notes;

/// <summary>
/// An app of its own, so writes never reach the read tests' store, and a fake clock, so a
/// server-set stamp is asserted exactly rather than as "roughly now".
/// </summary>
public abstract class ClockedApiFixture : AppFixture<Program>
{
    public FakeTimeProvider Clock { get; } =
        new(new DateTimeOffset(2026, 8, 25, 9, 30, 0, TimeSpan.Zero));

    protected override void ConfigureServices(IServiceCollection services)
    {
        services.RemoveAll<TimeProvider>();
        services.AddSingleton<TimeProvider>(Clock);
    }
}

/// <summary>Shared by the write tests whose clock never moves.</summary>
public class WriteApiFixture : ClockedApiFixture;

/// <summary>
/// Its own app because its test *advances* the clock, and a fixture is shared across every class
/// that names it: an advance under a sibling's feet is a flake, not a failure.
/// </summary>
public class AdvancingApiFixture : ClockedApiFixture;
