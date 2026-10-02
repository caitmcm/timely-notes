using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using TimelyNotes.API.Auth;
using TimelyNotes.API.Repositories;

namespace TimelyNotes.API.Tests.Auth;

public class AuthRegistrationTests
{
    private const string Authority = "https://tenant.example/";
    private const string Audience = "https://api.example";

    [Theory]
    [InlineData(AuthRegistration.AuthorityKey)]
    [InlineData(AuthRegistration.AudienceKey)]
    public void AMissingSettingFailsAtStartupByName(string missing)
    {
        var settings = Settings();
        settings.Remove(missing);

        var failure = Assert.Throws<InvalidOperationException>(() => new ServiceCollection()
            .AddNoteAuth(Configuration(settings), Environment(Environments.Production)));

        Assert.Contains(missing, failure.Message);
    }

    [Fact]
    public async Task OutsideDevelopment_Auth0IsTheOnlyScheme()
    {
        var schemes = Services(Environments.Production)
            .GetRequiredService<IAuthenticationSchemeProvider>();

        Assert.Equal(
            [AuthRegistration.Auth0Scheme],
            (await schemes.GetAllSchemesAsync()).Select(scheme => scheme.Name));
        Assert.Equal(
            AuthRegistration.Auth0Scheme, (await schemes.GetDefaultAuthenticateSchemeAsync())?.Name);
    }

    [Fact]
    public async Task InDevelopment_TheDefaultSchemeIsTheSelector()
    {
        var schemes = Services(Environments.Development)
            .GetRequiredService<IAuthenticationSchemeProvider>();

        Assert.Equal(
            new[]
            {
                AuthRegistration.Auth0Scheme,
                AuthRegistration.UserJwtsScheme,
                AuthRegistration.SelectorScheme
            }.Order(),
            (await schemes.GetAllSchemesAsync()).Select(scheme => scheme.Name).Order());
        Assert.Equal(
            AuthRegistration.SelectorScheme, (await schemes.GetDefaultAuthenticateSchemeAsync())?.Name);
    }

    [Theory]
    [InlineData("dotnet-user-jwts", AuthRegistration.UserJwtsScheme)]
    [InlineData(Authority, AuthRegistration.Auth0Scheme)]
    [InlineData("https://anyone-else.example/", AuthRegistration.Auth0Scheme)]
    public void InDevelopment_TheSelectorForwardsOnTheTokensIssuer(string issuer, string expected)
    {
        Assert.Equal(expected, Select($"Bearer {TokenFrom(issuer)}"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("Bearer not-a-jwt")]
    [InlineData("Bearer abc.def.ghi")]
    [InlineData("Basic dXNlcjpwYXNz")]
    public void InDevelopment_AnythingUnreadableGoesToAuth0(string? authorization)
    {
        Assert.Equal(AuthRegistration.Auth0Scheme, Select(authorization));
    }

    [Fact]
    public void Auth0ValidatesIssuerAudienceAndLifetime_AndKeepsClaimNamesAsSent()
    {
        var options = Services(Environments.Production)
            .GetRequiredService<IOptionsMonitor<JwtBearerOptions>>()
            .Get(AuthRegistration.Auth0Scheme);

        Assert.Equal(Authority, options.Authority);
        Assert.Equal(Audience, options.Audience);
        Assert.True(options.TokenValidationParameters.ValidateIssuer);
        Assert.True(options.TokenValidationParameters.ValidateAudience);
        Assert.True(options.TokenValidationParameters.ValidateLifetime);
        Assert.False(options.MapInboundClaims);
    }

    [Fact]
    public void UserJwtsKeepsClaimNamesAsSentToo()
    {
        var options = Services(Environments.Development)
            .GetRequiredService<IOptionsMonitor<JwtBearerOptions>>()
            .Get(AuthRegistration.UserJwtsScheme);

        Assert.False(options.MapInboundClaims);
    }

    [Fact]
    public void UserResolutionIsTheClaimsTransformation()
    {
        var transformation = Services(Environments.Production)
            .GetRequiredService<IClaimsTransformation>();

        Assert.IsType<UserResolution>(transformation);
    }

    private static string Select(string? authorization)
    {
        var selector = Services(Environments.Development)
            .GetRequiredService<IOptionsMonitor<PolicySchemeOptions>>()
            .Get(AuthRegistration.SelectorScheme)
            .ForwardDefaultSelector!;
        var context = new DefaultHttpContext();

        if (authorization is not null)
        {
            context.Request.Headers.Authorization = authorization;
        }

        return selector(context)!;
    }

    /// <summary>Unsigned: the selector reads the issuer, it never validates.</summary>
    private static string TokenFrom(string issuer) =>
        new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor { Issuer = issuer });

    private static ServiceProvider Services(string environment)
    {
        var configuration = Configuration(Settings());

        return new ServiceCollection()
            .AddLogging()
            .AddSingleton(configuration)
            .AddSingleton<IUserRepository, InMemoryUserRepository>()
            .AddNoteAuth(configuration, Environment(environment))
            .BuildServiceProvider();
    }

    private static Dictionary<string, string?> Settings() => new()
    {
        [AuthRegistration.AuthorityKey] = Authority,
        [AuthRegistration.AudienceKey] = Audience
    };

    private static IConfiguration Configuration(Dictionary<string, string?> settings) =>
        new ConfigurationBuilder().AddInMemoryCollection(settings).Build();

    private static IHostEnvironment Environment(string name) =>
        new TestEnvironment { EnvironmentName = name };

    private sealed class TestEnvironment : IHostEnvironment
    {
        public required string EnvironmentName { get; set; }

        public string ApplicationName { get; set; } = "TimelyNotes.API";

        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;

        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
