using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Auth;

/// <summary>
/// Turns a validated <c>(iss, sub)</c> into <see cref="UserClaims.Id"/>, provisioning the user on
/// first sight. Cached for the process: an id never changes and nothing deletes a user.
/// </summary>
public class UserResolution(IUserRepository users) : IClaimsTransformation
{
    private readonly ConcurrentDictionary<(string Issuer, string Subject), Guid> _ids = new();

    public async Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        if (principal.HasClaim(claim => claim.Type == UserClaims.Id)
            || principal.FindFirst(UserClaims.Issuer)?.Value is not { } issuer
            || principal.FindFirst(UserClaims.Subject)?.Value is not { } subject)
        {
            return principal;
        }

        if (!_ids.TryGetValue((issuer, subject), out var id))
        {
            // IClaimsTransformation has no token to pass.
            id = await users.Resolve(issuer, subject, CancellationToken.None);
            _ids.TryAdd((issuer, subject), id);
        }

        principal.AddIdentity(new ClaimsIdentity([new Claim(UserClaims.Id, id.ToString())]));

        return principal;
    }
}
