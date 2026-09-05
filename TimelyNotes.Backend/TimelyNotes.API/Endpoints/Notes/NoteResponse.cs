namespace TimelyNotes.API.Endpoints.Notes;

public class NoteResponse
{
    /// <summary>The calendar day the note belongs to; with the period, its address.</summary>
    public required DateOnly Day { get; set; }

    /// <summary>1-based period of that day.</summary>
    public required int PeriodOrdinal { get; set; }

    public required string Content { get; set; }

    /// <summary>Server-zone audit stamp; never used for placement.</summary>
    public required DateTimeOffset CreatedAt { get; set; }

    /// <summary>Server-zone audit stamp; never used for placement.</summary>
    public required DateTimeOffset ModifiedAt { get; set; }
}
