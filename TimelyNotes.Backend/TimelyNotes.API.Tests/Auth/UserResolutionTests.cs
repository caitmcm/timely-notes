using System.Security.Claims;
using TimelyNotes.API.Auth;
using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Tests.Auth;

public class UserResolutionTests
{
    private const string Issuer = "https://tenant.example/";

    [Fact]
    public async Task AddsTheResolvedUserIdAsAClaim()
    {
        var users = new CountingUsers();
        var resolution = new UserResolution(users);

        var principal = await resolution.TransformAsync(Principal(Issuer, "alice"));

        Assert.Equal(
            (await users.Resolve(Issuer, "alice", TestContext.Current.CancellationToken)).ToString(),
            principal.FindFirst(UserClaims.Id)?.Value);
    }

    [Fact]
    public async Task ResolvesEachPairOncePerProcess()
    {
        var users = new CountingUsers();
        var resolution = new UserResolution(users);

        await resolution.TransformAsync(Principal(Issuer, "alice"));
        await resolution.TransformAsync(Principal(Issuer, "alice"));
        await resolution.TransformAsync(Principal(Issuer, "bob"));
        await resolution.TransformAsync(Principal("https://elsewhere.example/", "alice"));

        Assert.Equal(3, users.Calls);
    }

    /// <summary>Authentication can transform one principal more than once per request.</summary>
    [Fact]
    public async Task TransformingTwiceAddsOneClaim()
    {
        var resolution = new UserResolution(new CountingUsers());

        var principal = await resolution.TransformAsync(
            await resolution.TransformAsync(Principal(Issuer, "alice")));

        Assert.Single(principal.FindAll(UserClaims.Id));
    }

    [Fact]
    public async Task APrincipalWithNoSubjectGetsNoUserClaim()
    {
        var users = new CountingUsers();
        var resolution = new UserResolution(users);
        var principal = new ClaimsPrincipal(
            new ClaimsIdentity([new Claim(UserClaims.Issuer, Issuer)], "test"));

        var transformed = await resolution.TransformAsync(principal);

        Assert.Null(transformed.FindFirst(UserClaims.Id));
        Assert.Equal(0, users.Calls);
    }

    [Fact]
    public async Task APrincipalWithNoIssuerGetsNoUserClaim()
    {
        var users = new CountingUsers();
        var resolution = new UserResolution(users);
        var principal = new ClaimsPrincipal(
            new ClaimsIdentity([new Claim(UserClaims.Subject, "alice")], "test"));

        var transformed = await resolution.TransformAsync(principal);

        Assert.Null(transformed.FindFirst(UserClaims.Id));
        Assert.Equal(0, users.Calls);
    }

    private static ClaimsPrincipal Principal(string issuer, string subject) =>
        new(new ClaimsIdentity(
            [new Claim(UserClaims.Issuer, issuer), new Claim(UserClaims.Subject, subject)], "test"));

    private sealed class CountingUsers : IUserRepository
    {
        private readonly InMemoryUserRepository _users = new();

        public int Calls { get; private set; }

        public Task<Guid> Resolve(string issuer, string subject, CancellationToken ct)
        {
            Calls++;

            return _users.Resolve(issuer, subject, ct);
        }
    }
}
