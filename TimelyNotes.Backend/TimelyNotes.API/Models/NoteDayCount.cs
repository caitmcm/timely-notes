namespace TimelyNotes.API.Models;

/// <summary>How many notes fall on one day. A projection rather than an entity.</summary>
public record NoteDayCount(DateOnly Day, int Count);
