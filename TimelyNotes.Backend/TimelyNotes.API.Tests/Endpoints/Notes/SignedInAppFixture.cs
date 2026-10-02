using FastEndpoints.Testing;
using Microsoft.Extensions.DependencyInjection;
using TimelyNotes.API.Tests.Auth;

namespace TimelyNotes.API.Tests.Endpoints.Notes;

/// <summary>The app under <see cref="TestUserScheme"/>, with <see cref="AppFixture{T}.Client"/> signed in as <c>alice</c>.</summary>
public abstract class SignedInAppFixture : AppFixture<Program>
{
    public const string DefaultUser = "alice";

    /// <summary>A client acting as <paramref name="user"/>.</summary>
    public HttpClient ClientFor(string user) =>
        CreateClient(client => client.DefaultRequestHeaders.Add(TestUserScheme.Header, user));

    /// <summary>A client with no credentials at all.</summary>
    public HttpClient AnonymousClient() => CreateClient();

    protected override void ConfigureServices(IServiceCollection services) =>
        services.AddTestUserScheme();

    protected override ValueTask SetupAsync()
    {
        Client.DefaultRequestHeaders.Add(TestUserScheme.Header, DefaultUser);

        return ValueTask.CompletedTask;
    }
}
