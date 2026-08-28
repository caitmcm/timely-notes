using FastEndpoints;
using FluentValidation;

namespace TimelyNotes.API.Endpoints.Notes;

/// <summary>
/// Rejects a window the endpoint will not serve. Both parameters are required — an omitted one is a
/// 400, never an implicit "just today".
/// </summary>
public class GetNotesByScheduleValidator : Validator<GetNotesByScheduleRequest>
{
    /// <summary>The widest window a single request may ask for. The number lives only here.</summary>
    public static readonly TimeSpan MaximumRange = TimeSpan.FromDays(7);

    private const string InstantFormat =
        "an ISO 8601 instant including its UTC offset, e.g. 2026-08-27T00:00:00+01:00";

    public GetNotesByScheduleValidator()
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

    private static bool HasBothBounds(GetNotesByScheduleRequest request) =>
        request.SearchFrom.HasValue && request.SearchTo.HasValue;
}
