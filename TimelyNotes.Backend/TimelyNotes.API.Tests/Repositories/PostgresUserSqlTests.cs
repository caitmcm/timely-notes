using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Tests.Repositories;

/// <summary>The provisioning statements pinned as text, as <see cref="PostgresUpsertSqlTests"/> does.</summary>
public class PostgresUserSqlTests
{
    [Fact]
    public void TheInsertYieldsToARacingInsertOfTheSamePair()
    {
        Assert.Contains("ON CONFLICT (issuer, subject) DO NOTHING", PostgresUserRepository.InsertSql);
    }

    [Fact]
    public void TheInsertSuppliesTheId()
    {
        Assert.Contains("INSERT INTO users (id, issuer, subject, created_at)", PostgresUserRepository.InsertSql);
    }

    [Fact]
    public void TheSelectMatchesOnBothIssuerAndSubject()
    {
        Assert.Contains("WHERE issuer = $1 AND subject = $2", PostgresUserRepository.SelectSql);
    }

    [Theory]
    [InlineData(PostgresUserRepository.InsertSql)]
    [InlineData(PostgresUserRepository.SelectSql)]
    public void EachIsOneStatement(string sql)
    {
        Assert.DoesNotContain(";", sql);
    }
}
