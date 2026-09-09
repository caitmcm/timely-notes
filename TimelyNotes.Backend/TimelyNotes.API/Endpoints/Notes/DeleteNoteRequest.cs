using TimelyNotes.API.Models;

namespace TimelyNotes.API.Endpoints.Notes;

/// <summary>The period, and nothing else — a delete has no body to carry anything more.</summary>
public class DeleteNoteRequest
{
    /// <summary><c>s1</c>, <c>s3</c> or <c>s6</c> — the Schedule's span in hours, with its sigil.</summary>
    public required string Schedule { get; set; }

    /// <summary>
    /// The note's calendar day. Nullable so a value that does not bind fails validation by name
    /// instead of binding to <c>default</c>.
    /// </summary>
    public DateOnly? Day { get; set; }

    /// <summary><c>p1</c>…<c>p{n}</c> — the period of that day, with its sigil, bounded by the Schedule.</summary>
    public string? Period { get; set; }

    /// <summary>The parsed <see cref="Schedule"/>; meaningful only once the validator has passed it.</summary>
    public int ScheduleSpanHours => Schedules.TryParse(Schedule, out var spanHours) ? spanHours : 0;

    /// <summary>
    /// The parsed <see cref="Period"/>, read against this request's own Schedule; meaningful only
    /// once the validator has passed both.
    /// </summary>
    public int PeriodOrdinal =>
        Periods.TryParse(ScheduleSpanHours, Period, out var ordinal) ? ordinal : 0;
}
