using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TimelyNotes.API.Auth;

namespace TimelyNotes.API.Tests.Auth;

/// <summary>
/// Authenticates <c>X-Test-User: alice</c> as <c>(iss "test", sub "alice")</c>, so a test can act
/// as several users without a signing key. No header, no user.
/// </summary>
public class TestUserScheme(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string Name = "Test";

    public const string Header = "X-Test-User";

    public const string Issuer = "test";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (Request.Headers[Header].ToString() is not { Length: > 0 } subject)
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var identity = new ClaimsIdentity(
            [new Claim(UserClaims.Issuer, Issuer), new Claim(UserClaims.Subject, subject)], Name);

        return Task.FromResult(
            AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Name)));
    }
}

public static class TestUserSchemeRegistration
{
    /// <summary>Replaces the app's default scheme; the bearer schemes stay registered, unused.</summary>
    public static IServiceCollection AddTestUserScheme(this IServiceCollection services)
    {
        services
            .AddAuthentication(options => options.DefaultScheme = TestUserScheme.Name)
            .AddScheme<AuthenticationSchemeOptions, TestUserScheme>(TestUserScheme.Name, null);

        return services;
    }
}
