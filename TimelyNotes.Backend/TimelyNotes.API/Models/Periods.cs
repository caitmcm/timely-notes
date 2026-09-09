namespace TimelyNotes.API.Models;

/// <summary>
/// The <c>p</c> sigil, and the one place a period is read off the wire. A period is a period *of a
/// Schedule* — the Schedule is what chops the day into the fixed set it belongs to — so an ordinal
/// cannot be obtained without naming one, and <c>p9</c> is a period of <c>s1</c> but not of
/// <c>s3</c>. <c>p4</c> on the wire, <c>4</c> in the model.
/// </summary>
public static class Periods
{
    /// <summary>
    /// Reads <c>p4</c> as the 4th period of that Schedule. Strict in both halves: no casing, sign,
    /// padding or stray text, and no ordinal the Schedule does not have — so one spelling addresses
    /// one period, and every other spelling addresses none.
    /// </summary>
    public static bool TryParse(int scheduleSpanHours, string? text, out int periodOrdinal)
    {
        periodOrdinal = 0;

        if (text is not ['p', .. var digits]
            || digits.Length == 0
            || digits[0] == '0'
            || !digits.All(char.IsAsciiDigit)
            || !int.TryParse(digits, out var ordinal)
            || !Schedules.IsValidPeriodOrdinal(scheduleSpanHours, ordinal))
        {
            return false;
        }

        periodOrdinal = ordinal;
        return true;
    }

    public static string Format(int periodOrdinal) => $"p{periodOrdinal}";
}
