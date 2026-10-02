using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Tests.Repositories;

public class InMemoryUserRepositoryTests
{
    private const string Issuer = "https://issuer.example/";

    [Fact]
    public async Task Resolve_ReturnsTheSameId_ForTheSamePair()
    {
        var users = new InMemoryUserRepository();

        var first = await users.Resolve(Issuer, "alice", TestContext.Current.CancellationToken);
        var second = await users.Resolve(Issuer, "alice", TestContext.Current.CancellationToken);

        Assert.NotEqual(Guid.Empty, first);
        Assert.Equal(first, second);
    }

    [Fact]
    public async Task Resolve_ReturnsADifferentId_ForADifferentSubject()
    {
        var users = new InMemoryUserRepository();

        var alice = await users.Resolve(Issuer, "alice", TestContext.Current.CancellationToken);
        var bob = await users.Resolve(Issuer, "bob", TestContext.Current.CancellationToken);

        Assert.NotEqual(alice, bob);
    }

    /// <summary>A subject is unique only within its issuer.</summary>
    [Fact]
    public async Task Resolve_ReturnsADifferentId_ForTheSameSubjectFromADifferentIssuer()
    {
        var users = new InMemoryUserRepository();

        var here = await users.Resolve(Issuer, "alice", TestContext.Current.CancellationToken);
        var there = await users.Resolve(
            "https://elsewhere.example/", "alice", TestContext.Current.CancellationToken);

        Assert.NotEqual(here, there);
    }

    [Fact]
    public async Task Resolve_MintsVersion7Ids()
    {
        var users = new InMemoryUserRepository();

        var id = await users.Resolve(Issuer, "alice", TestContext.Current.CancellationToken);

        Assert.Equal(7, id.Version);
    }

    [Fact]
    public async Task Resolve_CalledConcurrentlyForOneNewPair_ReturnsOneId()
    {
        var users = new InMemoryUserRepository();

        var ids = await Task.WhenAll(
            Enumerable.Range(0, 32).Select(_ => Task.Run(() =>
                users.Resolve(Issuer, "alice", TestContext.Current.CancellationToken))));

        Assert.Single(ids.Distinct());
    }
}
