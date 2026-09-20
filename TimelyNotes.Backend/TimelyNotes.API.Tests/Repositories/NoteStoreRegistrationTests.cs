using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Tests.Repositories;

public class NoteStoreRegistrationTests
{
    [Fact]
    public void MemoryResolvesTheInMemoryStore()
    {
        var (store, repository) = Register("Memory");

        Assert.Equal(NoteStore.Memory, store);
        Assert.IsType<InMemoryNoteRepository>(repository);
    }

    [Fact]
    public async Task MemoryResolvesAStoreThatIsAlreadySeeded()
    {
        var (_, repository) = Register("Memory");
        var today = DateOnly.FromDateTime(DateTime.Today);

        var notes = await repository.GetBySchedule(
            1, today.AddDays(-3), today.AddDays(4), TestContext.Current.CancellationToken);

        Assert.NotEmpty(notes);
    }

    [Fact]
    public void PostgresResolvesThePostgresStore()
    {
        var (store, repository) = Register("Postgres");

        Assert.Equal(NoteStore.Postgres, store);
        Assert.IsType<PostgresNoteRepository>(repository);
    }

    /// <summary>Registration alone: the connection string is configured but never opened.</summary>
    [Fact]
    public void PostgresOpensNoConnectionAtStartup()
    {
        var (_, repository) = Register("Postgres");

        Assert.IsType<PostgresNoteRepository>(repository);
    }

    /// <summary>
    /// A checkout with no user secret set has no connection string, and that has to read as the
    /// missing setting it is rather than as a connection failure later.
    /// </summary>
    [Fact]
    public void PostgresWithoutAConnectionStringThrowsNamingTheSetting()
    {
        var services = new ServiceCollection();

        var failure = Assert.Throws<InvalidOperationException>(
            () => services.AddNoteStore(Configuration("Postgres", connectionString: null)));

        Assert.Contains(NoteStoreRegistration.ConnectionStringName, failure.Message);
    }

    [Theory]
    [InlineData("memory", NoteStore.Memory)]
    [InlineData("POSTGRES", NoteStore.Postgres)]
    public void TheSettingIsReadCaseInsensitively(string configured, NoteStore expected)
    {
        var (store, _) = Register(configured);

        Assert.Equal(expected, store);
    }

    [Theory]
    [InlineData("Postgre")]
    [InlineData("Sqlite")]
    [InlineData("1")]
    public void AnUnrecognisedProviderThrowsNamingTheSettingAndTheValue(string configured)
    {
        var services = new ServiceCollection();

        var failure = Assert.Throws<InvalidOperationException>(
            () => services.AddNoteStore(Configuration(configured)));

        Assert.Contains(NoteStoreRegistration.ProviderKey, failure.Message);
        Assert.Contains(configured, failure.Message);
    }

    /// <summary>An existing checkout and the whole test suite keep working untouched.</summary>
    [Fact]
    public void AnAbsentSettingDefaultsToMemory()
    {
        var (store, repository) = Register(provider: null);

        Assert.Equal(NoteStore.Memory, store);
        Assert.IsType<InMemoryNoteRepository>(repository);
    }

    private static (NoteStore Store, INoteRepository Repository) Register(string? provider)
    {
        var services = new ServiceCollection();
        var store = services.AddNoteStore(Configuration(provider));

        return (store, services.BuildServiceProvider().GetRequiredService<INoteRepository>());
    }

    private static IConfiguration Configuration(
        string? provider,
        string? connectionString = "Host=localhost;Database=unopened")
    {
        var settings = new Dictionary<string, string?>();

        if (provider is not null)
        {
            settings[NoteStoreRegistration.ProviderKey] = provider;
        }

        if (connectionString is not null)
        {
            settings["ConnectionStrings:" + NoteStoreRegistration.ConnectionStringName] = connectionString;
        }

        return new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
    }
}
