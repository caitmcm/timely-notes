using FastEndpoints;
using FluentValidation;
using TimelyNotes.API.Models;

namespace TimelyNotes.API.Endpoints.Notes;

/// <summary>
/// The same address check the upsert runs: an unaddressable period is a bad request, not a 404.
/// </summary>
public class DeleteNoteValidator : Validator<DeleteNoteRequest>
{
    public DeleteNoteValidator()
    {
        RuleFor(request => request.Schedule)
            .Must(schedule => Schedules.TryParse(schedule, out _))
            .WithMessage(
                $"schedule must be one of {string.Join(", ", Schedules.Known.Select(Schedules.Format))}.");

        RuleFor(request => request.Day)
            .NotNull()
            .WithMessage("day is required: a calendar date, e.g. 2026-08-25.");

        // Only once the Schedule is known: a period has no bounds until one says what they are.
        When(HasAKnownSchedule, () =>
            RuleFor(request => request.Period)
                .Must((request, period) => Periods.TryParse(request.ScheduleSpanHours, period, out _))
                .WithMessage(request =>
                    $"period must be one of p1 to p{Schedules.PeriodCountFor(request.ScheduleSpanHours)} "
                    + $"for {Schedules.Format(request.ScheduleSpanHours)}, spelled exactly."));
    }

    private static bool HasAKnownSchedule(DeleteNoteRequest request) =>
        Schedules.TryParse(request.Schedule, out _);
}
