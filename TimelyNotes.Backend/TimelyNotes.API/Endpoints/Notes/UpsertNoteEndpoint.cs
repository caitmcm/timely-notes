using FastEndpoints;
using TimelyNotes.API.Models;
using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Endpoints.Notes;

public class UpsertNoteEndpoint(INoteRepository notes, TimeProvider clock)
    : Endpoint<UpsertNoteRequest, NoteResponse>
{
    public override void Configure()
    {
        Put("api/schedules/{schedule}/notes/{day}/{period}");
        AllowAnonymous();
        Summary(s =>
        {
            s.Summary = "Writes the note in a period, creating it if that period holds none.";
            s.Description =
                "The URL's period *is* the note's identity: the Schedule, the day and the period "
                + "together address exactly one note, so the body carries content alone and a note "
                + "can never be moved. Both sigils have exactly one spelling — s3 and p4, never S3, "
                + "s03, P4 or p04 — so one URL names one note. The period is 1-based and bounded by "
                + "the Schedule that chops the day into it (p9 on s3 is a 400, as is p9 with no "
                + "Schedule that has one), and the day is the caller's own calendar date, never "
                + "an instant. createdAt and modifiedAt are server-set and ignored if sent. "
                + "Repeating the request is safe: 201 the first time, 200 after, one note either "
                + "way. Empty content is accepted, and a note with none is never returned by a read "
                + "route.";
        });
    }

    public override async Task HandleAsync(UpsertNoteRequest req, CancellationToken ct)
    {
        // The Schedule parses, the ordinal is in range and content is non-null: the validator ran first.
        var writtenAt = clock.GetUtcNow();

        var result = await notes.Upsert(
            new Note
            {
                ScheduleSpanHours = req.ScheduleSpanHours,
                Day = req.Day!.Value,
                PeriodOrdinal = req.PeriodOrdinal,
                Content = req.Content!,
                CreatedAt = writtenAt,
                ModifiedAt = writtenAt
            },
            ct);

        var response = new NoteResponse
        {
            Day = result.Note.Day,
            PeriodOrdinal = result.Note.PeriodOrdinal,
            Content = result.Note.Content,
            CreatedAt = result.Note.CreatedAt,
            ModifiedAt = result.Note.ModifiedAt
        };

        // No Location: the request already named the address it wrote to.
        if (result.Created)
        {
            await Send.ResponseAsync(response, StatusCodes.Status201Created, ct);

            return;
        }

        await Send.OkAsync(response, ct);
    }
}
