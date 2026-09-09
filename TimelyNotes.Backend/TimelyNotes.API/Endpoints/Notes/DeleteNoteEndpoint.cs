using FastEndpoints;
using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Endpoints.Notes;

public class DeleteNoteEndpoint(INoteRepository notes) : Endpoint<DeleteNoteRequest>
{
    public override void Configure()
    {
        Delete("api/schedules/{schedule}/notes/{day}/{period}");
        AllowAnonymous();
        Summary(s =>
        {
            s.Summary = "Removes the note in a period.";
            s.Description =
                "404 when that period holds none, so a repeat is distinguishable from a first "
                + "delete. Deletes a note whatever its content: an emptied note is still a record.";
        });
    }

    public override async Task HandleAsync(DeleteNoteRequest req, CancellationToken ct)
    {
        // The Schedule parses and the ordinal is in range: the validator runs first.
        var deleted = await notes.Delete(
            req.ScheduleSpanHours, req.Day!.Value, req.PeriodOrdinal, ct);

        if (!deleted)
        {
            await Send.NotFoundAsync(ct);

            return;
        }

        await Send.NoContentAsync(ct);
    }
}
