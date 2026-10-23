# Character creation vertical slice

Authenticated routes:

- `POST /api/v1/characters` with JSON `{"displayName":"Ada","gameAge":18}` and a valid `X-CSRF-TOKEN` header creates a character.
- `GET /api/v1/characters/me` retrieves the current user's character and starting state.

Registration/login must establish the `GameCookie` session. Request a CSRF token using `GET /api/v1/auth/csrf` first.

Rules: one character per account (unique database index); game age 18-100; display name 2-32 characters; starting Intelligence=25, Discipline=25, Stress=0, Reputation=25, COIN balance=0. Initial inserts are written in a single EF Core SaveChanges transaction. Database uniqueness remains the concurrency guard.

The endpoint intentionally does not accept client-supplied attributes, COIN, or owner UserId. This is not yet a full playable flow: no character setup UI, attribute history, idempotency response replay, or gameplay execution. Existing migrations are generated dynamically in CI rather than committed; deploy only after schema migration and integration tests are addressed.
