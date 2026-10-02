namespace TimelyNotes.API.Repositories;

public interface IUserRepository
{
    /// <summary>
    /// The id of the user the provider knows as <paramref name="subject"/>, creating the user on
    /// first sight. Concurrent first calls for one pair all get the same id.
    /// </summary>
    Task<Guid> Resolve(string issuer, string subject, CancellationToken ct);
}
