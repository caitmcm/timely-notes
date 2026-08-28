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

    /// <summary>
    /// The time the note is taken <em>for</em> — the slot it occupies on its Schedule. Immutable,
    /// like the Schedule assignment: a note stays in the slot it was written into. This is the only
    /// field that decides where a note is placed, listed or filtered.
    /// </summary>
    public required DateTimeOffset OccursAt { get; init; }

    /// <summary>
    /// When the note was written — a server-set audit stamp. It plays no part in slotting: a note
    /// written today for last Tuesday has today's <see cref="CreatedAt"/> and last Tuesday's
    /// <see cref="OccursAt"/>.
    /// </summary>
    public required DateTimeOffset CreatedAt { get; init; }

    /// <summary>When the note was last written to — a server-set audit stamp, like <see cref="CreatedAt"/>.</summary>
    public required DateTimeOffset ModifiedAt { get; init; }
}
