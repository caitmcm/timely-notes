using FastEndpoints;
using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Endpoints.Notes;

public class GetNoteDaysByScheduleEndpoint(INoteRepository notes)
    : Endpoint<GetNoteDaysByScheduleRequest, List<NoteDayResponse>>
{
    public override void Configure()
    {
        Get("api/schedules/{scheduleShortName}/note-days");
        AllowAnonymous();
        Summary(s =>
        {
            s.Summary = "Counts a Schedule's notes per day, for painting a calendar.";
            s.Description =
                "Days holding notes whose occursAt is in [searchFrom, searchTo) — searchTo exclusive. "
                + "Both bounds are required ISO 8601 instants carrying their UTC offset, at most "
                + $"{GetNoteDaysByScheduleValidator.MaximumRange.TotalDays:0} days apart. Notes are "
                + "grouped into days in searchFrom's offset, so the days returned are the caller's.";
        });
    }

    public override async Task HandleAsync(GetNoteDaysByScheduleRequest req, CancellationToken ct)
    {
        // Both bounds are non-null: the validator runs first.
        var counts = await notes.GetDayCountsBySchedule(
            req.ScheduleShortName, req.SearchFrom!.Value, req.SearchTo!.Value, ct);

        await Send.OkAsync(
            [.. counts.Select(count => new NoteDayResponse { Day = count.Day, Count = count.Count })],
            ct);
    }
}
