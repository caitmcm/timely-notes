namespace TimelyNotes.API.Endpoints.Notes;

public class NoteDayResponse
{
    /// <summary>Midnight of the day, in the offset <c>searchFrom</c> carried.</summary>
    public required DateTimeOffset Day { get; set; }

    public required int Count { get; set; }
}
