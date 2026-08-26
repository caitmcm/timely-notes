using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Tests.Repositories;

public class InMemoryNoteRepositoryTests
{
    [Fact]
    public async Task GetBySchedule_ReturnsSeededNotes_ForAKnownSchedule()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule("s1", TestContext.Current.CancellationToken);

        Assert.NotEmpty(notes);
        Assert.All(notes, note => Assert.Equal("s1", note.ScheduleShortName));
    }

    [Theory]
    [InlineData("s1")]
    [InlineData("s3")]
    [InlineData("s6")]
    public async Task GetBySchedule_SeedsEverySchedule(string scheduleShortName)
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(scheduleShortName, TestContext.Current.CancellationToken);

        Assert.NotEmpty(notes);
        Assert.All(notes, note => Assert.Equal(scheduleShortName, note.ScheduleShortName));
    }

    [Fact]
    public async Task GetBySchedule_ReturnsEmpty_ForAnUnknownSchedule()
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule("s99", TestContext.Current.CancellationToken);

        Assert.Empty(notes);
    }

    [Fact]
    public async Task GetBySchedule_PopulatesEveryNoteField()
    {
        var repository = new InMemoryNoteRepository();

        var note = (await repository.GetBySchedule("s1", TestContext.Current.CancellationToken)).First();

        Assert.NotEqual(Guid.Empty, note.Id);
        Assert.False(string.IsNullOrWhiteSpace(note.Content));
        Assert.NotEqual(default, note.CreatedAt);
        Assert.NotEqual(default, note.ModifiedAt);
    }

    [Theory]
    [InlineData("s1")]
    [InlineData("s3")]
    [InlineData("s6")]
    public async Task GetBySchedule_SeedsNotesAgainstToday(string scheduleShortName)
    {
        var repository = new InMemoryNoteRepository();

        var notes = await repository.GetBySchedule(scheduleShortName, TestContext.Current.CancellationToken);

        Assert.NotEmpty(notes);
        Assert.All(notes, note =>
        {
            Assert.Equal(DateTime.Today, note.CreatedAt.LocalDateTime.Date);
            Assert.Equal(DateTime.Today, note.ModifiedAt.LocalDateTime.Date);
        });
    }
}
