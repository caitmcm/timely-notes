using FastEndpoints;
using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Endpoints.Notes;

public class GetNoteDaysByScheduleEndpoint(INoteRepository notes)
    : Endpoint<GetNoteDaysByScheduleRequest, List<NoteDayResponse>>
{
    public override void Configure()
    {
        Get("api/schedules/{schedule}/note-days");
        AllowAnonymous();
        Summary(s =>
        {
            s.Summary = "Counts a Schedule's notes per day, for painting a calendar.";
            s.Description =
                "Days holding notes in [searchFrom, searchTo) — searchTo exclusive. Both bounds are "
                + "required calendar dates (2026-09-01), at most "
                + $"{GetNoteDaysByScheduleValidator.MaximumRangeInDays} days apart.";
        });
    }

    public override async Task HandleAsync(GetNoteDaysByScheduleRequest req, CancellationToken ct)
    {
        // The Schedule parses and both bounds are non-null: the validator runs first.
        var counts = await notes.GetDayCountsBySchedule(
            req.ScheduleSpanHours, req.SearchFrom!.Value, req.SearchTo!.Value, ct);

        await Send.OkAsync(
            [.. counts.Select(count => new NoteDayResponse { Day = count.Day, Count = count.Count })],
            ct);
    }
}
