namespace TimelyNotes.API.Models;

/// <summary>The one definition of an empty note, decided on write so every store agrees.</summary>
public static class NoteContent
{
    /// <summary>Whitespace-only becomes <c>""</c>; anything else is verbatim, spaces included.</summary>
    public static string Normalise(string? content) =>
        string.IsNullOrWhiteSpace(content) ? string.Empty : content;

    /// <summary>Whether a read route returns it. Length alone: this is <c>content &lt;&gt; ''</c> in SQL.</summary>
    public static bool IsReadable(string content) => content.Length > 0;
}
