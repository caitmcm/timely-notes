namespace TimelyNotes.API.Repositories;

/// <summary>Which <see cref="INoteRepository"/> the app runs on, chosen by configuration.</summary>
public enum NoteStore
{
    Memory,
    Postgres
}
