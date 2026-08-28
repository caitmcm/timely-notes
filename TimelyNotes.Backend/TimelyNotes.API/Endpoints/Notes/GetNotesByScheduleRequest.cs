namespace TimelyNotes.API.Endpoints.Notes;

public class GetNotesByScheduleRequest
{
    /// <summary>Short name of the Schedule: <c>s1</c>, <c>s3</c> or <c>s6</c>.</summary>
    public required string ScheduleShortName { get; set; }

    /// <summary>
    /// Start of the window, <b>inclusive</b>. Required query parameter: an ISO 8601 instant carrying
    /// its UTC offset, e.g. <c>2026-08-27T00:00:00+01:00</c>. Days are local midnights in the
    /// browser and the server has no idea what timezone the caller is in, so the boundary instants
    /// are the caller's to compute.
    /// </summary>
    /// <remarks>Nullable so that an omitted parameter is a named validation failure, not a silent default.</remarks>
    public DateTimeOffset? SearchFrom { get; set; }

    /// <summary>
    /// End of the window, <b>exclusive</b>. Required query parameter, same format as
    /// <see cref="SearchFrom"/>. The range is half-open — <c>[searchFrom, searchTo)</c> — so
    /// adjacent windows never return the same note twice.
    /// </summary>
    public DateTimeOffset? SearchTo { get; set; }
}
