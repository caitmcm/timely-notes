using Microsoft.EntityFrameworkCore;
using TimelyNotes.API.Data;

namespace TimelyNotes.API.Tests.Data;

/// <summary>
/// A context configured exactly as the app configures it, over a connection string that is never
/// opened. Reading the model and generating SQL both stay off the wire.
/// </summary>
internal static class NotesDbContextFixture
{
    private const string Unreachable = "Host=localhost;Database=timely_notes_tests";

    public static NotesDbContext Context() => new(Options());

    public static DbContextOptions<NotesDbContext> Options() =>
        new DbContextOptionsBuilder<NotesDbContext>()
            .UseNpgsql(Unreachable)
            .UseSnakeCaseNamingConvention()
            .Options;
}
