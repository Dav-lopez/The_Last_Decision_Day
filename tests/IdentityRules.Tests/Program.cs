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
