using TheLastDecision.Api.Identity;

static void Assert(bool value, string name)
{
    if (!value) throw new Exception("FAIL: " + name);
    Console.WriteLine("PASS: " + name);
}
var today = new DateOnly(2026, 10, 23);
Assert(AdultEligibility.IsAtLeast18(new DateOnly(2008, 10, 23), today), "18th birthday qualifies");
Assert(!AdultEligibility.IsAtLeast18(new DateOnly(2008, 10, 24), today), "one day before 18th birthday rejected");
Assert(!AdultEligibility.IsAtLeast18(new DateOnly(2030, 1, 1), today), "future date rejected");
Assert(AdultEligibility.IsAtLeast18(new DateOnly(2000, 2, 29), today), "leap day adult qualifies");
Assert(AdultEligibility.NormalizeEmail("  example@domain.test ") == "EXAMPLE@DOMAIN.TEST", "email normalization");
try
{
    AdultEligibility.NormalizeEmail("invalid");
    throw new Exception("FAIL: invalid email accepted");
}
catch (ArgumentException) { Console.WriteLine("PASS: invalid email rejected"); }

var proxyOptions = new Microsoft.AspNetCore.Builder.ForwardedHeadersOptions();
TheLastDecision.Api.Identity.TrustedProxyHeaders.Configure(proxyOptions);
Assert(proxyOptions.ForwardLimit == 1, "forwarded header chain limited to one hop");
Assert(proxyOptions.ForwardedHeaders ==
    (Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor |
     Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto),
    "only client address and scheme forwarding enabled");
Assert(proxyOptions.KnownProxies.Count == 2 &&
    proxyOptions.KnownProxies.Contains(System.Net.IPAddress.Loopback) &&
    proxyOptions.KnownProxies.Contains(System.Net.IPAddress.IPv6Loopback),
    "only loopback proxies trusted");
Assert(proxyOptions.KnownIPNetworks.Count == 0, "no arbitrary forwarded networks trusted");

Assert(RegistrationDatabaseErrors.IsConflictSqlState("40001"),
    "registration treats serialization failure as a retryable conflict");
Assert(RegistrationDatabaseErrors.IsConflictSqlState("40P01"),
    "registration treats PostgreSQL deadlock as a retryable conflict");
Assert(RegistrationDatabaseErrors.IsConflictSqlState("23505"),
    "registration treats uniqueness race as a conflict");
Assert(!RegistrationDatabaseErrors.IsConflictSqlState("08006") &&
       !RegistrationDatabaseErrors.IsConflictSqlState("23503") &&
       !RegistrationDatabaseErrors.IsConflictSqlState(null),
    "registration does not hide unrelated database failures as conflicts");

var countingHasher = new CountingPasswordHasher();
Assert(LoginPasswordVerification.Verify(countingHasher, null, "wrong-password") ==
    Microsoft.AspNetCore.Identity.PasswordVerificationResult.Failed &&
    countingHasher.Verifications == 1,
    "unknown account runs a decoy hash verification and is rejected");
var disabledUser = new GameUser { IsDisabled = true, PasswordHash = "test" };
Assert(LoginPasswordVerification.Verify(countingHasher, disabledUser, "wrong-password") ==
    Microsoft.AspNetCore.Identity.PasswordVerificationResult.Failed &&
    countingHasher.Verifications == 2,
    "disabled account verifies password but cannot authenticate");

var defaultHasher = new Microsoft.AspNetCore.Identity.PasswordHasher<GameUser>();
var activeUser = new GameUser();
activeUser.PasswordHash = defaultHasher.HashPassword(activeUser, "correct-horse-battery-staple");
Assert(LoginPasswordVerification.Verify(defaultHasher, activeUser, "incorrect") ==
    Microsoft.AspNetCore.Identity.PasswordVerificationResult.Failed,
    "wrong password rejected");
Assert(LoginPasswordVerification.Verify(defaultHasher, activeUser, "correct-horse-battery-staple") ==
    Microsoft.AspNetCore.Identity.PasswordVerificationResult.Success,
    "valid modern password accepted");
var legacyHasher = new Microsoft.AspNetCore.Identity.PasswordHasher<GameUser>(
    Microsoft.Extensions.Options.Options.Create(new Microsoft.AspNetCore.Identity.PasswordHasherOptions
    {
        CompatibilityMode = Microsoft.AspNetCore.Identity.PasswordHasherCompatibilityMode.IdentityV2
    }));
activeUser.PasswordHash = legacyHasher.HashPassword(activeUser, "legacy-password");
Assert(LoginPasswordVerification.Verify(defaultHasher, activeUser, "legacy-password") ==
    Microsoft.AspNetCore.Identity.PasswordVerificationResult.SuccessRehashNeeded,
    "legacy password hash triggers upgrade after successful verification");
Assert(LoginPasswordVerification.Verify(defaultHasher, activeUser, "wrong") ==
    Microsoft.AspNetCore.Identity.PasswordVerificationResult.Failed,
    "wrong password never triggers a hash upgrade");

sealed class CountingPasswordHasher : Microsoft.AspNetCore.Identity.IPasswordHasher<GameUser>
{
    public int Verifications { get; private set; }
    public string HashPassword(GameUser user, string password) => "test";
    public Microsoft.AspNetCore.Identity.PasswordVerificationResult VerifyHashedPassword(
        GameUser user, string hashedPassword, string providedPassword)
    {
        Verifications++;
        return Microsoft.AspNetCore.Identity.PasswordVerificationResult.Success;
    }
}
