using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using TimelyNotes.API.Data;
using TimelyNotes.API.Models;

namespace TimelyNotes.API.Tests.Data;

/// <summary>
/// The schema, read off the model rather than off a server — no database is reachable from the
/// test suite by design (<c>LocalPostgres.MD</c> decision 8).
/// </summary>
public class NotesDbContextTests
{
    [Fact]
    public void TheAddressIsThePrimaryKey()
    {
        var key = Entity().FindPrimaryKey();

        Assert.NotNull(key);
        Assert.Equal(
            [
                nameof(Note.ScheduleSpanHours),
                nameof(Note.Day),
                nameof(Note.PeriodOrdinal)
            ],
            key.Properties.Select(property => property.Name));
    }

    [Fact]
    public void ThereIsNoOtherKey()
    {
        var keys = Entity().GetKeys();

        Assert.Single(keys);
    }

    /// <summary>No surrogate id: nothing is generated, so the address is the only way in.</summary>
    [Fact]
    public void NothingIsStoreGenerated()
    {
        var generated = Entity()
            .GetProperties()
            .Where(property => property.ValueGenerated != ValueGenerated.Never);

        Assert.Empty(generated);
    }

    [Fact]
    public void ThereIsNoShadowProperty()
    {
        var shadow = Entity().GetProperties().Where(property => property.IsShadowProperty());

        Assert.Empty(shadow);
    }

    [Theory]
    [InlineData(nameof(Note.Content), "text")]
    [InlineData(nameof(Note.Day), "date")]
    [InlineData(nameof(Note.CreatedAt), "timestamp with time zone")]
    [InlineData(nameof(Note.ModifiedAt), "timestamp with time zone")]
    [InlineData(nameof(Note.ScheduleSpanHours), "integer")]
    [InlineData(nameof(Note.PeriodOrdinal), "integer")]
    public void ColumnsTakeTheIntendedTypes(string property, string columnType)
    {
        Assert.Equal(columnType, Property(property).GetColumnType());
    }

    [Fact]
    public void ContentIsRequired()
    {
        Assert.False(Property(nameof(Note.Content)).IsNullable);
    }

    [Theory]
    [InlineData(nameof(Note.ScheduleSpanHours), "schedule_span_hours")]
    [InlineData(nameof(Note.PeriodOrdinal), "period_ordinal")]
    [InlineData(nameof(Note.CreatedAt), "created_at")]
    [InlineData(nameof(Note.ModifiedAt), "modified_at")]
    [InlineData(nameof(Note.Day), "day")]
    [InlineData(nameof(Note.Content), "content")]
    public void ColumnsAreSnakeCased(string property, string column)
    {
        Assert.Equal(column, Property(property).GetColumnName());
    }

    [Fact]
    public void TheTableIsSnakeCasedToo()
    {
        Assert.Equal("notes", Entity().GetTableName());
    }

    private static IEntityType Entity() =>
        NotesDbContextFixture.Context().Model.FindEntityType(typeof(Note))!;

    private static IProperty Property(string name) => Entity().FindProperty(name)!;
}
