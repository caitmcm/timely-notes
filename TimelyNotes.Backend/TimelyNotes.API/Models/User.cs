namespace TimelyNotes.API.Models;

/// <summary>
/// An account: the identity provider's <c>(Issuer, Subject)</c> under an id of our own. No email,
/// name or profile.
/// </summary>
public class User
{
    /// <summary>Minted by the app with <see cref="Guid.CreateVersion7()"/>, never by the database.</summary>
    public required Guid Id { get; init; }

    /// <summary>The token's <c>iss</c>, trailing slash included.</summary>
    public required string Issuer { get; init; }

    /// <summary>The token's <c>sub</c>; unique only within its issuer.</summary>
    public required string Subject { get; init; }

    public required DateTimeOffset CreatedAt { get; init; }
}
