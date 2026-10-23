# School activity history

This increment adds a read-only, authenticated `GET /api/v1/school/history` endpoint and a recent-decisions panel in the React client.

## Behavior

- Returns at most 20 **completed** activities, newest first. It derives the character from the signed-in user and only reads the matching `school:<character-id>` idempotency scope.
- History is sourced from the transactionally saved idempotency response. It includes actions that produced no attribute change (e.g. capped attributes), without creating a new table or EF migration.
- Each item includes activity ID, informational time cost, before/after attributes, correlation ID and completion timestamp. It does **not** imply a daily time budget.
- Replaying an activity with the same idempotency key returns its original response and does not create another history entry.
- Invalid persisted response JSON is skipped with a server warning rather than causing the entire history request to fail.
- No wallet transactions or other users' records are returned. The endpoint requires authentication and performs no mutation.

## Manual verification

1. Apply all committed EF migrations to a disposable PostgreSQL database and start the API and web app.
2. Sign in with an invited test account, create a character, and verify the recent-decisions list is initially empty.
3. Complete two different school activities. Confirm two records appear in descending completion order, including before/after attribute changes.
4. Refresh the browser and sign in again; confirm the same history is visible.
5. Repeat a completed request with its **same** `Idempotency-Key`; verify no extra history entry appears.
6. With a second account, verify the first account's history is not visible. Unauthenticated requests should return 401.
7. Drive an attribute to its limit, execute a zero-delta action, and confirm the activity still appears.
8. Verify no sensitive idempotency keys or credentials are included in API responses.

## Validation boundaries

`tests/SchoolRules.Tests` checks persisted response decoding, completion timestamps and corrupt/mismatched records without a database. CI API builds, frontend typechecks/builds and PostgreSQL migration validation are required. **No live database/browser integration test has been run by this change.** The existing CI Docker smoke test only validates startup behavior.
