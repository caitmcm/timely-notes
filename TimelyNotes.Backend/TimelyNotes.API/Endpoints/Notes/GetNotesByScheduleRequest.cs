namespace TimelyNotes.API.Endpoints.Notes;

public class GetNotesByScheduleRequest
{
    /// <summary>Short name of the Schedule: <c>s1</c>, <c>s3</c> or <c>s6</c>.</summary>
    public required string ScheduleShortName { get; set; }
}
