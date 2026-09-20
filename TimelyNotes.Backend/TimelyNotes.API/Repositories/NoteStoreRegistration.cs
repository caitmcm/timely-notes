using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TimelyNotes.API.Data;

namespace TimelyNotes.API.Repositories;

/// <summary>The provider switch: one setting, one registration, nothing downstream changes.</summary>
public static class NoteStoreRegistration
{
    public const string ProviderKey = "Database:Provider";

    /// <summary>Set in user secrets, not checked in: it carries the developer server password.</summary>
    public const string ConnectionStringName = "Notes";

    /// <summary>
    /// Registers the store named by <see cref="ProviderKey"/>, defaulting to
    /// <see cref="NoteStore.Memory"/>. Never inferred from whether a connection string is present:
    /// a typo would then fall back to the seeded store, which reads exactly like data loss. No
    /// connection is opened here — only the registration is decided.
    /// </summary>
    public static NoteStore AddNoteStore(this IServiceCollection services, IConfiguration configuration)
    {
        var store = ResolveStore(configuration);

        // Singleton either way: the in-memory seed has to survive across requests, and the Postgres
        // repository holds a context factory rather than a scoped context.
        switch (store)
        {
            case NoteStore.Memory:
                services.AddSingleton<INoteRepository>(_ =>
                {
                    var notes = new InMemoryNoteRepository();
                    notes.Seed();

                    return notes;
                });
                break;

            case NoteStore.Postgres:
                // Read here rather than in the options lambda, which runs on first resolution —
                // an absent connection string is a startup failure, not a first-request one.
                var connectionString = ConnectionString(configuration);

                // A factory, not a scoped context: a scoped one cannot be injected into a singleton.
                services.AddDbContextFactory<NotesDbContext>(options => options
                    .UseNpgsql(connectionString)
                    .UseSnakeCaseNamingConvention());

                services.AddSingleton<INoteRepository, PostgresNoteRepository>();
                break;
        }

        return store;
    }

    /// <summary>
    /// Read at registration so an absent one fails here, named. Nothing is connected to: a bad
    /// string still surfaces on the first request, but a missing one reads as the missing setting.
    /// </summary>
    private static string ConnectionString(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString(ConnectionStringName);

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                $"ConnectionStrings:{ConnectionStringName} is not set, and "
                + $"{ProviderKey} is '{NoteStore.Postgres}'. Set it with dotnet user-secrets.");
        }

        return connectionString;
    }

    private static NoteStore ResolveStore(IConfiguration configuration)
    {
        var configured = configuration[ProviderKey];

        if (string.IsNullOrWhiteSpace(configured))
        {
            return NoteStore.Memory;
        }

        // Matched against the names, not Enum.TryParse: that accepts "1" as Postgres, and a
        // settings file where the store is a number is the silent-wrong-store bug again.
        foreach (var store in Enum.GetValues<NoteStore>())
        {
            if (string.Equals(store.ToString(), configured, StringComparison.OrdinalIgnoreCase))
            {
                return store;
            }
        }

        throw new InvalidOperationException(
            $"{ProviderKey} was '{configured}'. Expected "
            + $"'{nameof(NoteStore.Memory)}' or '{nameof(NoteStore.Postgres)}'.");
    }
}
