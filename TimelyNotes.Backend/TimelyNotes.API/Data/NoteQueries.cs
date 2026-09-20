using Microsoft.EntityFrameworkCore;
using TimelyNotes.API.Models;

namespace TimelyNotes.API.Data;

/// <summary>
/// The two reads as queries rather than results, so the SQL they generate is assertable without a
/// server. Filtering and grouping stay here — that is what lets Postgres do them.
/// </summary>
public static class NoteQueries
{
    public static IQueryable<Note> Notes(
        NotesDbContext db,
        int scheduleSpanHours,
        DateOnly searchFrom,
        DateOnly searchTo) =>
        InRange(db, scheduleSpanHours, searchFrom, searchTo)
            .OrderByDescending(note => note.Day)
            .ThenByDescending(note => note.PeriodOrdinal);

    public static IQueryable<NoteDayCount> DayCounts(
        NotesDbContext db,
        int scheduleSpanHours,
        DateOnly searchFrom,
        DateOnly searchTo) =>
        InRange(db, scheduleSpanHours, searchFrom, searchTo)
            .GroupBy(note => note.Day)
            .OrderBy(day => day.Key)
            .Select(day => new NoteDayCount(day.Key, day.Count()));

    /// <summary>
    /// Schedule, half-open day range, and readable content. The emptiness test is spelled
    /// <c>!= ""</c> rather than through <see cref="NoteContent.IsReadable"/>, which cannot be
    /// translated; normalising on write is what keeps the two the same predicate.
    /// </summary>
    private static IQueryable<Note> InRange(
        NotesDbContext db,
        int scheduleSpanHours,
        DateOnly searchFrom,
        DateOnly searchTo) =>
        db.Notes
            .AsNoTracking()
            .Where(note => note.ScheduleSpanHours == scheduleSpanHours)
            .Where(note => note.Day >= searchFrom && note.Day < searchTo)
            .Where(note => note.Content != "");
}
