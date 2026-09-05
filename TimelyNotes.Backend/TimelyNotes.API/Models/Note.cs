namespace TimelyNotes.API.Models;

/// <summary>
/// One note, addressed by the period it sits in. <see cref="ScheduleSpanHours"/>,
/// <see cref="Day"/> and <see cref="PeriodOrdinal"/> together are the key: a period holds at most
/// one note, and there is no surrogate id to address it by instead.
/// </summary>
public class Note
{
    /// <summary>The Schedule, which <em>is</em> its span: 1, 3 or 6. <c>s3</c> on the wire.</summary>
    public required int ScheduleSpanHours { get; init; }

    /// <summary>The writer's calendar day. No instant, so nothing reinterprets it.</summary>
    public required DateOnly Day { get; init; }

    /// <summary>1-based period of that day: on <c>s3</c>, 09:00–12:00 is <c>p4</c>.</summary>
    public required int PeriodOrdinal { get; init; }

    /// <summary>Markdown.</summary>
    public required string Content { get; init; }

    /// <summary>Server-zone audit stamp; never used for placement.</summary>
    public required DateTimeOffset CreatedAt { get; init; }

    /// <summary>Server-zone audit stamp; never used for placement.</summary>
    public required DateTimeOffset ModifiedAt { get; init; }
}
