# Google account registration integration

This PR adds a **disabled-by-default** entry point. It does not implement or claim working Google OAuth. Do not enable `VITE_GOOGLE_AUTH_ENABLED` until the backend is implemented and tested.

## Server-side implementation checklist
1. Configure Google OAuth/OIDC with a Google Cloud OAuth consent screen, a web application client ID and secret, and an exact production redirect URI. Keep secrets on the API host, never in Vite client variables.
2. Add an ASP.NET Core Google challenge at `GET /api/v1/auth/google/start` and a server-side callback. Use correlation/state protection and a temporary external authentication cookie; validate Google's signed identity through the authentication middleware.
3. On callback, identify users by Google's stable `sub` claim, **not email alone**. Link existing password accounts only after explicit authenticated confirmation to prevent account takeover.
4. Before creating a new game account, require verified date of birth (18+), a valid unused invitation, and explicit acceptance of terms. Persist the provider subject and user ID with a unique index and a migration; atomically redeem invitations.
5. Issue the existing `GameCookie` session after successful account creation or lookup. Keep the existing `/api/v1/auth/me`, logout, CSRF protections and rate limits.
6. Test cancelled login, wrong state, expired invitation, underage registration, duplicate Google account, existing email collision, disabled user, logout, replay and redirect allowlisting.
7. Only after server rollout, set `VITE_GOOGLE_AUTH_ENABLED=true` in the web deployment.

No Google secrets or IDs are checked into Git.
