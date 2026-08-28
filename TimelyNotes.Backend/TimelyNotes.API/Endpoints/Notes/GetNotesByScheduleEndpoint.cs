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
            s.Summary = "Lists a Schedule's notes falling in a half-open time range, newest first.";
            s.Description =
                "Returns every note in the Schedule whose occursAt is in [searchFrom, searchTo) — "
                + "searchFrom inclusive, searchTo exclusive — ordered by occursAt descending. Both "
                + "parameters are required ISO 8601 instants carrying their UTC offset, and the "
                + $"range may not exceed {GetNotesByScheduleValidator.MaximumRange.TotalDays:0} days. "
                + "Because the upper bound is exclusive, adjacent windows never return the same note twice.";
        });
    }

    public override async Task HandleAsync(GetNotesByScheduleRequest req, CancellationToken ct)
    {
        // The validator guarantees both bounds are present by the time the handler runs.
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
