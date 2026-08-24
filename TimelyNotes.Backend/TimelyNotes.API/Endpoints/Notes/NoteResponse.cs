namespace TimelyNotes.API.Endpoints.Notes;

public class NoteResponse
{
    public required Guid Id { get; set; }

    public required string Content { get; set; }

    public required DateTimeOffset CreatedAt { get; set; }

    public required DateTimeOffset ModifiedAt { get; set; }
}
