using Microsoft.EntityFrameworkCore;
using TimelyNotes.API.Data;

namespace TimelyNotes.API.Tests.Data;

/// <summary>
/// The two reads as SQL. No server is reached — <c>ToQueryString()</c> is how the filtering,
/// ordering and grouping that the repository promises are asserted without one.
/// </summary>
public class NoteQueriesTests
{
    private static readonly DateOnly From = new(2026, 8, 24);
    private static readonly DateOnly To = new(2026, 8, 31);

    public class TheNotesQuery
    {
        [Fact]
        public void FiltersOnTheSchedule()
        {
            Assert.Contains("n.schedule_span_hours = @", Sql());
        }

        /// <summary>Half-open: inclusive lower bound, exclusive upper.</summary>
        [Fact]
        public void FiltersOnTheHalfOpenDayRange()
        {
            var sql = Sql();

            Assert.Contains("n.day >= @", sql);
            Assert.Contains("n.day < @", sql);
            Assert.DoesNotContain("n.day <= ", sql);
        }

        /// <summary>The emptiness predicate, and the one that means the same in C# and in SQL.</summary>
        [Fact]
        public void FiltersOutEmptyContent()
        {
            Assert.Contains("n.content <> ''", Sql());
        }

        [Fact]
        public void OrdersNewestFirstByDayThenOrdinal()
        {
            Assert.Contains("ORDER BY n.day DESC, n.period_ordinal DESC", Sql());
        }

        private static string Sql() =>
            NoteQueries.Notes(NotesDbContextFixture.Context(), 3, From, To).ToQueryString();
    }

    public class TheDayCountsQuery
    {
        [Fact]
        public void GroupsByDayInSql()
        {
            Assert.Contains("GROUP BY n.day", Sql());
        }

        [Fact]
        public void CountsInSql()
        {
            Assert.Contains("count(*)", Sql(), StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public void AppliesTheSameEmptinessPredicate()
        {
            Assert.Contains("n.content <> ''", Sql());
        }

        [Fact]
        public void FiltersOnTheScheduleAndTheHalfOpenDayRange()
        {
            var sql = Sql();

            Assert.Contains("n.schedule_span_hours = @", sql);
            Assert.Contains("n.day >= @", sql);
            Assert.Contains("n.day < @", sql);
            Assert.DoesNotContain("n.day <= ", sql);
        }

        [Fact]
        public void OrdersAscending()
        {
            var sql = Sql();

            Assert.Contains("ORDER BY n.day", sql);
            Assert.DoesNotContain("DESC", sql);
        }

        private static string Sql() =>
            NoteQueries.DayCounts(NotesDbContextFixture.Context(), 3, From, To).ToQueryString();
    }
}
