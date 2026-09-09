using TimelyNotes.API.Models;

namespace TimelyNotes.API.Endpoints.Notes;

/// <summary>
/// The period is the address, so it is the route and nothing else: a body carrying a day or an
/// ordinal could move a note, and this type is where that sentence is made unsayable.
/// </summary>
public class UpsertNoteRequest
{
    /// <summary>
    /// <c>s1</c>, <c>s3</c> or <c>s6</c> — the Schedule's span in hours, with its sigil. Not
    /// <c>required</c>: this request has a body, so the serializer reads the DTO before the route
    /// binder fills it in, and a required property would fail there instead of in the validator.
    /// </summary>
    public string? Schedule { get; set; }

    /// <summary>
    /// The note's calendar day, e.g. <c>2026-08-25</c>. Nullable so a value that does not bind
    /// fails validation by name instead of binding to <c>default</c>.
    /// </summary>
    public DateOnly? Day { get; set; }

    /// <summary><c>p1</c>…<c>p{n}</c> — the period of that day, with its sigil, bounded by the Schedule.</summary>
    public string? Period { get; set; }

    /// <summary>Markdown. Empty is legal: the client writes the clearing of a note like any other change.</summary>
    public string? Content { get; set; }

    /// <summary>The parsed <see cref="Schedule"/>; meaningful only once the validator has passed it.</summary>
    public int ScheduleSpanHours => Schedules.TryParse(Schedule, out var spanHours) ? spanHours : 0;

    /// <summary>
    /// The parsed <see cref="Period"/>, read against this request's own Schedule; meaningful only
    /// once the validator has passed both.
    /// </summary>
    public int PeriodOrdinal =>
        Periods.TryParse(ScheduleSpanHours, Period, out var ordinal) ? ordinal : 0;
}
