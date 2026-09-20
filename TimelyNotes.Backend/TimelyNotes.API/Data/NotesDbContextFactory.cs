using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Data;

/// <summary>
/// Design-time only: <c>dotnet ef</c> builds the context from here rather than from the host, so a
/// migration can be generated whatever <c>Database:Provider</c> currently says. The connection
/// string comes from the same user secret the app reads, which is what lets
/// <c>database update</c> reach the real database; the placeholder is for
/// <c>migrations add</c>, which needs a provider but no server.
/// </summary>
public class NotesDbContextFactory : IDesignTimeDbContextFactory<NotesDbContext>
{
    private const string Unreachable = "Host=localhost;Database=timely_notes_dev";

    public NotesDbContext CreateDbContext(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .AddUserSecrets<NotesDbContextFactory>()
            .AddEnvironmentVariables()
            .Build();

        var connectionString =
            configuration.GetConnectionString(NoteStoreRegistration.ConnectionStringName)
            ?? Unreachable;

        return new NotesDbContext(new DbContextOptionsBuilder<NotesDbContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .Options);
    }
}
