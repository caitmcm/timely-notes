using System.Collections.Concurrent;

namespace TimelyNotes.API.Repositories;

/// <summary>The <see cref="NoteStore.Memory"/> counterpart; forgotten on restart, like its notes.</summary>
public class InMemoryUserRepository : IUserRepository
{
    private readonly ConcurrentDictionary<(string Issuer, string Subject), Lazy<Guid>> _users = new();

    /// <inheritdoc />
    public Task<Guid> Resolve(string issuer, string subject, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        // Lazy, so a losing racer's factory never mints an id of its own.
        var id = _users.GetOrAdd((issuer, subject), _ => new Lazy<Guid>(Guid.CreateVersion7)).Value;

        return Task.FromResult(id);
    }
}
