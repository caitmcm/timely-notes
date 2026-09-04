namespace TimelyNotes.API.Models;

/// <summary>
/// How many notes fall on one day. A projection rather than an entity: <paramref name="Day"/> is
/// midnight in the offset the caller asked in, so the day is the caller's local one.
/// </summary>
public record NoteDayCount(DateTimeOffset Day, int Count);
