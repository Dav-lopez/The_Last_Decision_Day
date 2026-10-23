# Identity domain foundation

This increment introduces persistent model definitions for adult accounts and one-time invites, plus a private foreign-key relationship between a character and its owner. The existing unique Character.UserId index continues to enforce one character per account.

## Security boundaries

- Never return GameUser.DateOfBirth, PasswordHash or GameInvite.TokenHash from public APIs.
- Do not store raw invite tokens; generate cryptographically secure random tokens and persist a keyed or salted digest.
- Registration must validate 18+ eligibility on the server against a trusted current date, consume an unexpired unused invite atomically, normalize and validate email, and hash passwords with a dedicated password hasher.
- Login requires a secure HttpOnly SameSite cookie session, CSRF defense, rate limits, session revocation, and user-disabled checks.
- No registration, login or invite issuance endpoints are implemented by this PR. These domain entities alone are **not** a secure authentication system.
- The EF migration CI job still generates a disposable migration. A reviewed committed initial migration and migration-snapshot validation remain required.

## Leap-day rule

DateOnly.AddYears(18) maps February 29 to February 28 in a non-leap year. This is the currently implemented birthday policy; confirm applicable legal eligibility requirements before opening registration.
