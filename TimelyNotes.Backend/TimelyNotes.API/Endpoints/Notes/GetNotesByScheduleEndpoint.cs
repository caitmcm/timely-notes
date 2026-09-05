using FastEndpoints;
using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Endpoints.Notes;

public class GetNotesByScheduleEndpoint(INoteRepository notes)
    : Endpoint<GetNotesByScheduleRequest, List<NoteResponse>>
{
    public override void Configure()
    {
        Get("api/schedules/{schedule}/notes");
        AllowAnonymous();
        Summary(s =>
        {
            s.Summary = "Lists a Schedule's notes in a range of days, newest first.";
            s.Description =
                "Notes whose day is in [searchFrom, searchTo) — searchTo exclusive, so adjacent "
                + "windows never repeat a note. Both bounds are required calendar dates (2026-08-27), "
                + $"at most {GetNotesByScheduleValidator.MaximumRangeInDays} days apart.";
        });
    }

    public override async Task HandleAsync(GetNotesByScheduleRequest req, CancellationToken ct)
    {
        // The Schedule parses and both bounds are non-null: the validator runs first.
        var scheduleNotes = await notes.GetBySchedule(
            req.ScheduleSpanHours, req.SearchFrom!.Value, req.SearchTo!.Value, ct);

        await Send.OkAsync(
            [
                .. scheduleNotes.Select(note => new NoteResponse
                {
                    Day = note.Day,
                    PeriodOrdinal = note.PeriodOrdinal,
                    Content = note.Content,
                    CreatedAt = note.CreatedAt,
                    ModifiedAt = note.ModifiedAt
                })
            ],
            ct);
    }
}
