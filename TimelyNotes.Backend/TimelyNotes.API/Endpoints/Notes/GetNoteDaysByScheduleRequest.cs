using TimelyNotes.API.Models;

namespace TimelyNotes.API.Endpoints.Notes;

public class GetNoteDaysByScheduleRequest
{
    /// <summary><c>s1</c>, <c>s3</c> or <c>s6</c> — the Schedule's span in hours, with its sigil.</summary>
    public required string Schedule { get; set; }

    /// <summary>
    /// Inclusive start, e.g. <c>2026-09-01</c>. Required, but nullable so an omitted parameter
    /// fails validation by name instead of binding to <c>default</c>.
    /// </summary>
    public DateOnly? SearchFrom { get; set; }

    /// <summary>Exclusive end. Required and nullable, as <see cref="SearchFrom"/>.</summary>
    public DateOnly? SearchTo { get; set; }

    /// <summary>The parsed <see cref="Schedule"/>; meaningful only once the validator has passed it.</summary>
    public int ScheduleSpanHours => Schedules.TryParse(Schedule, out var spanHours) ? spanHours : 0;
}
