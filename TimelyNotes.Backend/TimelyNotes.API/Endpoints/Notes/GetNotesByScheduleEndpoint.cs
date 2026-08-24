using FastEndpoints;
using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Endpoints.Notes;

public class GetNotesByScheduleEndpoint(INoteRepository notes)
    : Endpoint<GetNotesByScheduleRequest, List<NoteResponse>>
{
    public override void Configure()
    {
        Get("api/schedules/{scheduleShortName}/notes");
        AllowAnonymous();
        Summary(s => s.Summary = "Lists the notes belonging to a Schedule, newest first.");
    }

    public override async Task HandleAsync(GetNotesByScheduleRequest req, CancellationToken ct)
    {
        var scheduleNotes = await notes.GetBySchedule(req.ScheduleShortName, ct);

        await Send.OkAsync(
            [
                .. scheduleNotes.Select(note => new NoteResponse
                {
                    Id = note.Id,
                    Content = note.Content,
                    CreatedAt = note.CreatedAt,
                    ModifiedAt = note.ModifiedAt
                })
            ],
            ct);
    }
}
