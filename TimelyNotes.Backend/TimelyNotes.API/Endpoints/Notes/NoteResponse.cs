namespace TimelyNotes.API.Endpoints.Notes;

public class NoteResponse
{
    public required Guid Id { get; set; }

    public required string Content { get; set; }

    /// <summary>The slot the note is taken for — what the UI places and orders it by.</summary>
    public required DateTimeOffset OccursAt { get; set; }

    /// <summary>Audit stamp; never used for placement.</summary>
    public required DateTimeOffset CreatedAt { get; set; }

    /// <summary>Audit stamp; never used for placement.</summary>
    public required DateTimeOffset ModifiedAt { get; set; }
}
