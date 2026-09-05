namespace TimelyNotes.API.Endpoints.Notes;

public class NoteDayResponse
{
    public required DateOnly Day { get; set; }

    public required int Count { get; set; }
}
