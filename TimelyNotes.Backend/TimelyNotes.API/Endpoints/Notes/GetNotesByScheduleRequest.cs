namespace TimelyNotes.API.Endpoints.Notes;

public class GetNotesByScheduleRequest
{
    /// <summary><c>s1</c>, <c>s3</c> or <c>s6</c>.</summary>
    public required string ScheduleShortName { get; set; }

    /// <summary>
    /// Inclusive start, e.g. <c>2026-08-27T00:00:00+01:00</c>. Required, but nullable so an omitted
    /// parameter fails validation by name instead of binding to <c>default</c>.
    /// </summary>
    public DateTimeOffset? SearchFrom { get; set; }

    /// <summary>Exclusive end. Required and nullable, as <see cref="SearchFrom"/>.</summary>
    public DateTimeOffset? SearchTo { get; set; }
}
