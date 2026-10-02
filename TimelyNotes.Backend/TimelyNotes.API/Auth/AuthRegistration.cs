using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.JsonWebTokens;

namespace TimelyNotes.API.Auth;

/// <summary>A resource server: validates bearer tokens, never issues them.</summary>
public static class AuthRegistration
{
    public const string AuthorityKey = "Auth:Authority";

    public const string AudienceKey = "Auth:Audience";

    public const string Auth0Scheme = "Auth0";

    /// <summary>The scheme <c>dotnet user-jwts</c> configures under <c>Authentication:Schemes:Bearer</c>.</summary>
    public const string UserJwtsScheme = JwtBearerDefaults.AuthenticationScheme;

    public const string SelectorScheme = "ByIssuer";

    private const string UserJwtsIssuer = "dotnet-user-jwts";

    public static IServiceCollection AddNoteAuth(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var authority = Required(configuration, AuthorityKey);
        var audience = Required(configuration, AudienceKey);
        var development = environment.IsDevelopment();

        var authentication = services
            .AddAuthentication(development ? SelectorScheme : Auth0Scheme)
            .AddJwtBearer(Auth0Scheme, options =>
            {
                options.Authority = authority;
                options.Audience = audience;
                options.MapInboundClaims = false;
            });

        if (development)
        {
            authentication
                .AddJwtBearer(UserJwtsScheme, options => options.MapInboundClaims = false)
                .AddPolicyScheme(SelectorScheme, SelectorScheme, options =>
                    options.ForwardDefaultSelector = SchemeFor);
        }

        services.AddSingleton<IClaimsTransformation, UserResolution>();
        services.AddAuthorization();

        return services;
    }

    /// <summary>Reads the issuer unvalidated; the scheme it picks does the validating.</summary>
    private static string SchemeFor(HttpContext context)
    {
        const string prefix = "Bearer ";
        var header = context.Request.Headers.Authorization.ToString();

        if (!header.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return Auth0Scheme;
        }

        return IssuerOf(header[prefix.Length..].Trim()) == UserJwtsIssuer ? UserJwtsScheme : Auth0Scheme;
    }

    /// <summary><c>CanReadToken</c> checks only the shape, so a three-part string of junk still throws.</summary>
    private static string? IssuerOf(string token)
    {
        try
        {
            return new JsonWebTokenHandler().ReadJsonWebToken(token).Issuer;
        }
        catch (ArgumentException)
        {
            return null;
        }
    }

    private static string Required(IConfiguration configuration, string key)
    {
        var value = configuration[key];

        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException($"{key} is not set. It belongs in appsettings.json.");
        }

        return value;
    }
}
