using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Tests.Repositories;

/// <summary>
/// The one statement the whole addressing model rests on, pinned as text. Whether Postgres runs it
/// as intended is the by-hand walk-through's job; that it still says what it must is this test's.
/// </summary>
public class PostgresUpsertSqlTests
{
    private const string Sql = PostgresNoteRepository.UpsertSql;

    [Fact]
    public void ItIsOneStatement()
    {
        Assert.DoesNotContain(";", Sql);
    }

    [Fact]
    public void TheConflictTargetIsTheWholeAddress()
    {
        Assert.Contains("ON CONFLICT (schedule_span_hours, day, period_ordinal) DO UPDATE", Sql);
    }

    /// <summary>CreatedAt is honoured on the create path only — the SQL is what enforces that.</summary>
    [Fact]
    public void ReplacingLeavesCreatedAtAlone()
    {
        var update = Sql[Sql.IndexOf("DO UPDATE", StringComparison.Ordinal)..];

        Assert.DoesNotContain("created_at =", update);
        Assert.Contains("content = EXCLUDED.content", update);
        Assert.Contains("modified_at = EXCLUDED.modified_at", update);
    }

    /// <summary>Create against replace, without a second round trip.</summary>
    [Fact]
    public void ItReturnsWhetherItCreated()
    {
        Assert.Contains("(xmax = 0) AS created", Sql);
    }

    [Fact]
    public void ItReturnsTheWrittenRow()
    {
        var returning = Sql[Sql.IndexOf("RETURNING", StringComparison.Ordinal)..];

        Assert.Contains("content", returning);
        Assert.Contains("created_at", returning);
        Assert.Contains("modified_at", returning);
    }
}
