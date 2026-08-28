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
        Summary(s =>
        {
            s.Summary = "Lists a Schedule's notes in a time range, newest first.";
            s.Description =
                "Notes whose occursAt is in [searchFrom, searchTo) — searchTo exclusive, so adjacent "
                + "windows never repeat a note. Both bounds are required ISO 8601 instants carrying "
                + $"their UTC offset, at most {GetNotesByScheduleValidator.MaximumRange.TotalDays:0} days apart.";
        });
    }

    public override async Task HandleAsync(GetNotesByScheduleRequest req, CancellationToken ct)
    {
        // Both bounds are non-null: the validator runs first.
        var scheduleNotes = await notes.GetBySchedule(
            req.ScheduleShortName, req.SearchFrom!.Value, req.SearchTo!.Value, ct);

        await Send.OkAsync(
            [
                .. scheduleNotes.Select(note => new NoteResponse
                {
                    Id = note.Id,
                    Content = note.Content,
                    OccursAt = note.OccursAt,
                    CreatedAt = note.CreatedAt,
                    ModifiedAt = note.ModifiedAt
                })
            ],
            ct);
    }
}
