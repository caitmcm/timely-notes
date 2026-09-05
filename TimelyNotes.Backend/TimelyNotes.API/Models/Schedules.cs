namespace TimelyNotes.API.Models;

/// <summary>
/// The one place the backend knows a Schedule's shape. A Schedule <em>is</em> its span in hours —
/// unique per user, and no two overlap the same periods — so the span is the identity, not an
/// attribute of one. <c>s3</c> on the wire, <c>3</c> in the model.
/// </summary>
public static class Schedules
{
    private const int HoursInADay = 24;

    /// <summary>Every member must divide 24 exactly, or <see cref="PeriodCountFor"/> is not the period count.</summary>
    public static IReadOnlyList<int> Known { get; } = [1, 3, 6];

    public static bool IsKnown(int scheduleSpanHours) => Known.Contains(scheduleSpanHours);

    public static int PeriodCountFor(int scheduleSpanHours) =>
        IsKnown(scheduleSpanHours)
            ? HoursInADay / scheduleSpanHours
            : throw new ArgumentOutOfRangeException(
                nameof(scheduleSpanHours),
                scheduleSpanHours,
                $"Unknown Schedule: expected one of {string.Join(", ", Known.Select(Format))}.");

    /// <summary>1-based: <c>p1</c> starts the day, <c>p{PeriodCountFor}</c> ends it.</summary>
    public static bool IsValidPeriodOrdinal(int scheduleSpanHours, int periodOrdinal) =>
        IsKnown(scheduleSpanHours)
        && periodOrdinal >= 1
        && periodOrdinal <= PeriodCountFor(scheduleSpanHours);

    /// <summary>Reads <c>s3</c> as 3. Strict: no casing, sign, padding or stray text, so one spelling addresses one Schedule.</summary>
    public static bool TryParse(string? text, out int scheduleSpanHours)
    {
        scheduleSpanHours = 0;

        if (text is not ['s', .. var digits]
            || digits.Length == 0
            || digits[0] == '0'
            || !digits.All(char.IsAsciiDigit)
            || !int.TryParse(digits, out var span)
            || !IsKnown(span))
        {
            return false;
        }

        scheduleSpanHours = span;
        return true;
    }

    public static string Format(int scheduleSpanHours) => $"s{scheduleSpanHours}";
}
