namespace TimelyNotes.API.Endpoints.Notes;

public class GetNoteDaysByScheduleRequest
{
    /// <summary><c>s1</c>, <c>s3</c> or <c>s6</c>.</summary>
    public required string ScheduleShortName { get; set; }

    /// <summary>
    /// Inclusive start, e.g. <c>2026-09-01T00:00:00+01:00</c>. Its offset is also the offset the
    /// days are grouped in. Required, but nullable so an omitted parameter fails validation by name.
    /// </summary>
    public DateTimeOffset? SearchFrom { get; set; }

    /// <summary>Exclusive end. Required and nullable, as <see cref="SearchFrom"/>.</summary>
    public DateTimeOffset? SearchTo { get; set; }
}
