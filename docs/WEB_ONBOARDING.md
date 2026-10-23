# Web onboarding

The React frontend now supports invite registration, login, logout, current-account recovery, character creation, and character profile display. All requests use the same-origin /api/v1 endpoints with cookie credentials; mutating requests fetch a CSRF token first.

## Manual smoke path

1. Apply a working database migration and create a valid invite hash in the database using a trusted administrative workflow (invite issuance UI is not implemented).
2. Serve the frontend and API over HTTPS behind the same origin (secure cookies are required).
3. Select **Use invitation**, enter adult date of birth and valid invite, then register.
4. Create a character; verify the initial four attributes and zero COIN.
5. Refresh the browser; verify account and character are restored.
6. Sign out and sign back in; verify profile loads again.

## Known limitations

No automated browser E2E test yet; no committed EF migration; no secure invite issuance administration; no gameplay interactions. Client-side form validation is supplementary; server validation is authoritative. An API error retrieving a profile is currently treated as missing character, including non-404 failures; refine error handling before production.
