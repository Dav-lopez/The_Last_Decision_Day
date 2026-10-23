# School activity execution

Authenticated characters can execute one of the four catalog activities with `POST /api/v1/school/activities/{activityId}/execute`.

The request must include a valid `X-CSRF-TOKEN` header obtained from `GET /api/v1/auth/csrf` and a client-generated UUID in the `Idempotency-Key` header. The browser client retains the same key for retries of an uncertain request, then discards it after a successful response.

Execution computes the same capped attribute changes as preview, stages attribute audit events through `AttributeService`, and commits them with a scoped idempotency record in one PostgreSQL serializable transaction. Duplicate requests with the same character, activity and key return the original response without applying a second change. Reusing the key for another activity returns 409. Concurrent transaction conflicts return 409; retry with the **same** key. The API rate-limits execution to 20 requests/minute per authenticated user.

**Important limitations:** TimeCost is descriptive only: there is no daily clock or energy budget yet. Repeated activities with new keys are allowed. A fully clamped activity may have no attribute-change audit events, but still creates an idempotency record. This is not a full progression system.

## Manual smoke test (requires a provisioned database, HTTPS, and an invited account)

1. Log in and create a character if necessary.
2. Record the current attributes. Preview `study` and verify it does not change the profile.
3. Click **Do activity**. Verify Intelligence +4, Discipline +2 and Stress +3, capped at 100.
4. Refresh; the new values should persist.
5. Retry the exact same HTTP request with the same Idempotency-Key: the response should be identical, and attributes should not change again.
6. Send a different activity with the reused key: expect HTTP 409.
7. Verify an unauthenticated execution is rejected, and a missing/invalid CSRF token is rejected.
8. Execute concurrent activities and verify either serializable completion or an HTTP 409 requiring a safe retry. Inspect attribute audit rows and idempotency records in PostgreSQL.

CI currently runs the existing API, frontend, database migration, and Docker smoke checks. **This document does not claim that these manual end-to-end scenarios have been executed.**
