using TimelyNotes.API.Models;

namespace TimelyNotes.API.Tests.Models;

public class NoteContentTests
{
    /// <summary><c>char.IsWhiteSpace</c> counts more than Postgres' <c>btrim</c> does.</summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\n")]
    [InlineData("\r\n")]
    [InlineData("\t")]
    [InlineData(" ")]
    [InlineData(" \n\t  ")]
    public void Normalise_CollapsesWhitespaceOnlyContentToEmpty(string? content)
    {
        Assert.Equal(string.Empty, NoteContent.Normalise(content));
    }

    /// <summary>This normalises the empty case; it does not trim notes.</summary>
    [Theory]
    [InlineData("hi", "hi")]
    [InlineData("  hi  ", "  hi  ")]
    [InlineData("\n# Heading\n\nBody\n", "\n# Heading\n\nBody\n")]
    [InlineData(" hi", " hi")]
    public void Normalise_KeepsContentThatIsNotWhitespaceOnlyVerbatim(string content, string expected)
    {
        Assert.Equal(expected, NoteContent.Normalise(content));
    }

    [Theory]
    [InlineData("hi", true)]
    [InlineData("  hi  ", true)]
    [InlineData("", false)]
    public void IsReadable_AnswersWhetherNormalisedContentHasAnything(string content, bool expected)
    {
        Assert.Equal(expected, NoteContent.IsReadable(content));
    }

    /// <summary>Length alone, so it says what SQL says; normalisation on write is the rest.</summary>
    [Fact]
    public void IsReadable_DoesNotRenormalise_SoItSaysWhatSqlWillSay()
    {
        Assert.True(NoteContent.IsReadable("   "));
    }
}
