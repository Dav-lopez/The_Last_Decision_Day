using Microsoft.AspNetCore.Identity;

namespace TheLastDecision.Api.Identity;

/// <summary>
/// Centralizes credential verification so unknown and disabled accounts never
/// authenticate. An unknown account still performs a password hash verification
/// to reduce the observable timing difference from a wrong password.
/// </summary>
public static class LoginPasswordVerification
{
    private static readonly GameUser DecoyUser = CreateDecoyUser();

    private static GameUser CreateDecoyUser()
    {
        var user = new GameUser();
        user.PasswordHash = new PasswordHasher<GameUser>().HashPassword(
            user, Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32)));
        return user;
    }

    public static PasswordVerificationResult Verify(
        IPasswordHasher<GameUser> hasher, GameUser? user, string password)
    {
        if (user is null)
        {
            _ = hasher.VerifyHashedPassword(DecoyUser, DecoyUser.PasswordHash, password);
            return PasswordVerificationResult.Failed;
        }

        // Verify disabled accounts too; never let the result authorize them.
        var result = hasher.VerifyHashedPassword(user, user.PasswordHash, password);
        return user.IsDisabled ? PasswordVerificationResult.Failed : result;
    }
}
