namespace TimelyNotes.API.Models;

public class Note
{
    public required Guid Id { get; init; }

    /// <summary><c>s1</c>, <c>s3</c> or <c>s6</c>. Immutable once set.</summary>
    public required string ScheduleShortName { get; init; }

    /// <summary>Markdown.</summary>
    public required string Content { get; init; }

    /// <summary>
    /// The slot the note is taken <em>for</em>. Immutable, and the only field placement, ordering
    /// and filtering use.
    /// </summary>
    public required DateTimeOffset OccursAt { get; init; }

    /// <summary>Server-set audit stamp; never used for placement.</summary>
    public required DateTimeOffset CreatedAt { get; init; }

    /// <summary>Server-set audit stamp; never used for placement.</summary>
    public required DateTimeOffset ModifiedAt { get; init; }
}
