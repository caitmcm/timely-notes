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
                nameof(Note.UserId),
                nameof(Note.ScheduleSpanHours),
                nameof(Note.Day),
                nameof(Note.PeriodOrdinal)
            ],
            key.Properties.Select(property => property.Name));
    }

    [Fact]
    public void UserIdIsARequiredForeignKeyToUserThatRestrictsDeletes()
    {
        var foreignKey = Assert.Single(Entity().GetForeignKeys());

        Assert.Equal(typeof(User), foreignKey.PrincipalEntityType.ClrType);
        Assert.Equal([nameof(Note.UserId)], foreignKey.Properties.Select(property => property.Name));
        Assert.Equal(
            [nameof(User.Id)], foreignKey.PrincipalKey.Properties.Select(property => property.Name));
        Assert.True(foreignKey.IsRequired);
        Assert.Equal(DeleteBehavior.Restrict, foreignKey.DeleteBehavior);
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
    [InlineData(nameof(Note.UserId), "uuid")]
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
    [InlineData(nameof(Note.UserId), "user_id")]
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

    public class TheUsersTable
    {
        [Fact]
        public void IdIsThePrimaryKey()
        {
            var key = Users().FindPrimaryKey();

            Assert.NotNull(key);
            Assert.Equal([nameof(User.Id)], key.Properties.Select(property => property.Name));
        }

        /// <summary>The app mints it, so a racing insert can be told apart by its conflict.</summary>
        [Fact]
        public void IdIsNotStoreGenerated()
        {
            Assert.Equal(ValueGenerated.Never, Column(nameof(User.Id)).ValueGenerated);
        }

        [Fact]
        public void IssuerAndSubjectAreAUniqueKey()
        {
            var key = Assert.Single(Users().GetKeys(), key => !key.IsPrimaryKey());

            Assert.Equal(
                [nameof(User.Issuer), nameof(User.Subject)],
                key.Properties.Select(property => property.Name));
            Assert.Equal("ak_users_issuer_subject", key.GetName());
        }

        [Theory]
        [InlineData(nameof(User.Id), "uuid")]
        [InlineData(nameof(User.Issuer), "text")]
        [InlineData(nameof(User.Subject), "text")]
        [InlineData(nameof(User.CreatedAt), "timestamp with time zone")]
        public void ColumnsTakeTheIntendedTypes(string property, string columnType)
        {
            Assert.Equal(columnType, Column(property).GetColumnType());
        }

        [Theory]
        [InlineData(nameof(User.Issuer))]
        [InlineData(nameof(User.Subject))]
        public void IssuerAndSubjectAreRequired(string property)
        {
            Assert.False(Column(property).IsNullable);
        }

        [Fact]
        public void TheTableIsUsers()
        {
            Assert.Equal("users", Users().GetTableName());
        }

        private static IEntityType Users() =>
            NotesDbContextFixture.Context().Model.FindEntityType(typeof(User))!;

        private static IProperty Column(string name) => Users().FindProperty(name)!;
    }
}
