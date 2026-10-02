namespace TimelyNotes.API.Auth;

/// <summary>Claim names, spelled once. <c>iss</c> and <c>sub</c> arrive unmapped.</summary>
public static class UserClaims
{
    /// <summary>Added by <see cref="UserResolution"/>; never in a token.</summary>
    public const string Id = "timely:user_id";

    public const string Issuer = "iss";

    public const string Subject = "sub";
}
