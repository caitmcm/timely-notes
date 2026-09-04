using FastEndpoints;
using FluentValidation;

namespace TimelyNotes.API.Endpoints.Notes;

public class GetNoteDaysByScheduleValidator : Validator<GetNoteDaysByScheduleRequest>
{
    /// <summary>Six whole weeks — the widest month grid, so one request paints any of them.</summary>
    public static readonly TimeSpan MaximumRange = TimeSpan.FromDays(42);

    private const string InstantFormat =
        "an ISO 8601 instant including its UTC offset, e.g. 2026-09-01T00:00:00+01:00";

    public GetNoteDaysByScheduleValidator()
    {
        RuleFor(request => request.SearchFrom)
            .NotNull()
            .WithMessage($"searchFrom is required: {InstantFormat}.");

        RuleFor(request => request.SearchTo)
            .NotNull()
            .WithMessage($"searchTo is required: {InstantFormat}.");

        When(HasBothBounds, () =>
        {
            RuleFor(request => request.SearchTo)
                .Must((request, searchTo) => searchTo!.Value > request.SearchFrom!.Value)
                .WithMessage(
                    "searchTo must be later than searchFrom: the range is half-open, [searchFrom, searchTo).");

            RuleFor(request => request.SearchTo)
                .Must((request, searchTo) => searchTo!.Value - request.SearchFrom!.Value <= MaximumRange)
                .WithMessage(
                    $"searchTo must be no more than {MaximumRange.TotalDays:0} days after searchFrom.");
        });
    }

    private static bool HasBothBounds(GetNoteDaysByScheduleRequest request) =>
        request.SearchFrom.HasValue && request.SearchTo.HasValue;
}
