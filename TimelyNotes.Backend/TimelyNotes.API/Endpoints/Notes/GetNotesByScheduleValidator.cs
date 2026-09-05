using FastEndpoints;
using FluentValidation;
using TimelyNotes.API.Models;

namespace TimelyNotes.API.Endpoints.Notes;

public class GetNotesByScheduleValidator : Validator<GetNotesByScheduleRequest>
{
    /// <summary>Widest window one request may ask for; the number lives only here.</summary>
    public const int MaximumRangeInDays = 7;

    private const string DayFormat = "a calendar date, e.g. 2026-08-27";

    public GetNotesByScheduleValidator()
    {
        RuleFor(request => request.Schedule)
            .Must(schedule => Schedules.TryParse(schedule, out _))
            .WithMessage(
                $"schedule must be one of {string.Join(", ", Schedules.Known.Select(Schedules.Format))}.");

        RuleFor(request => request.SearchFrom)
            .NotNull()
            .WithMessage($"searchFrom is required: {DayFormat}.");

        RuleFor(request => request.SearchTo)
            .NotNull()
            .WithMessage($"searchTo is required: {DayFormat}.");

        When(HasBothBounds, () =>
        {
            RuleFor(request => request.SearchTo)
                .Must((request, searchTo) => searchTo!.Value > request.SearchFrom!.Value)
                .WithMessage(
                    "searchTo must be later than searchFrom: the range is half-open, [searchFrom, searchTo).");

            RuleFor(request => request.SearchTo)
                .Must((request, searchTo) =>
                    searchTo!.Value.DayNumber - request.SearchFrom!.Value.DayNumber <= MaximumRangeInDays)
                .WithMessage($"searchTo must be no more than {MaximumRangeInDays} days after searchFrom.");
        });
    }

    private static bool HasBothBounds(GetNotesByScheduleRequest request) =>
        request.SearchFrom.HasValue && request.SearchTo.HasValue;
}
