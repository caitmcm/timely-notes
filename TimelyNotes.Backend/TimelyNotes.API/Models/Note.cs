namespace TimelyNotes.API.Models;

/// <summary>
/// A markdown note captured within a single Schedule. A note's Schedule assignment is immutable.
/// </summary>
public class Note
{
    public required Guid Id { get; init; }

    /// <summary>Short name of the owning Schedule: <c>s1</c>, <c>s3</c> or <c>s6</c>.</summary>
    public required string ScheduleShortName { get; init; }

    /// <summary>Markdown body of the note.</summary>
    public required string Content { get; init; }

    public required DateTimeOffset CreatedAt { get; init; }

    public required DateTimeOffset ModifiedAt { get; init; }
}
