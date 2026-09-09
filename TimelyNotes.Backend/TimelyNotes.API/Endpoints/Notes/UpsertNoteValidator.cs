using FastEndpoints;
using FluentValidation;
using TimelyNotes.API.Models;

namespace TimelyNotes.API.Endpoints.Notes;

public class UpsertNoteValidator : Validator<UpsertNoteRequest>
{
    /// <summary>Longest content one note may hold; the number lives only here.</summary>
    public const int MaximumContentLength = 16_384;

    public UpsertNoteValidator()
    {
        RuleFor(request => request.Schedule)
            .Must(schedule => Schedules.TryParse(schedule, out _))
            .WithMessage(
                $"schedule must be one of {string.Join(", ", Schedules.Known.Select(Schedules.Format))}.");

        RuleFor(request => request.Day)
            .NotNull()
            .WithMessage("day is required: a calendar date, e.g. 2026-08-25.");

        // Only once the Schedule is known: a period has no bounds until one says what they are, and
        // an unknown Schedule is already a 400 naming itself.
        When(HasAKnownSchedule, () =>
            RuleFor(request => request.Period)
                .Must((request, period) => Periods.TryParse(request.ScheduleSpanHours, period, out _))
                .WithMessage(request =>
                    $"period must be one of p1 to p{Schedules.PeriodCountFor(request.ScheduleSpanHours)} "
                    + $"for {Schedules.Format(request.ScheduleSpanHours)}, spelled exactly."));

        // Not null, but empty is accepted: create-on-first-content and save-the-clearing both need it.
        RuleFor(request => request.Content)
            .NotNull()
            .WithMessage("content is required; it may be empty.")
            .MaximumLength(MaximumContentLength);
    }

    private static bool HasAKnownSchedule(UpsertNoteRequest request) =>
        Schedules.TryParse(request.Schedule, out _);
}
