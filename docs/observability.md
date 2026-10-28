# Operational logging and incident triage

The API emits one structured JSON console event per HTTP request with UTC timestamp, trace/request identifiers, HTTP method, matched route template, status code, and elapsed milliseconds. Failed requests (4xx) use Warning and server failures (5xx) use Error. Unhandled exceptions are logged with stack traces and returned to clients as sanitized 500 problem responses containing a trace ID.

## Run and collect

For Docker deployments, inspect `docker compose logs --timestamps api` (adjust the service name if your compose file differs). For systemd deployments, inspect `journalctl -u <api-service> --since today -o cat`. Keep logs in a restricted destination with retention and rotation enabled; the API does not ship logs to a hosted vendor by default.

## Investigation

1. Search JSON logs by `TraceId` or `RequestId` from the response or incident report.
2. Correlate the completion event (route, status, duration) with any exception event.
3. Check PostgreSQL availability and migration status using `/api/v1/health/ready`.
4. Review rate-limit 429, authentication 401/403, school conflict 409, and server 5xx trends separately.
5. Escalate repeated 5xx and sustained high latency; establish thresholds from measured production baselines.

## Security and privacy

Do not log request/response bodies, cookies, authorization headers, CSRF tokens, idempotency keys, raw paths, query strings, connection strings, or credentials. The middleware records route templates instead of player-specific URLs. Framework and database diagnostics may contain sensitive values if separately configured: keep EF Core sensitive-data logging disabled and limit log access. Trace IDs are diagnostic identifiers, not authentication credentials.

## Future work

Add OpenTelemetry traces and metrics with an OTLP exporter, persistent log aggregation and retention, dashboards for request rates/errors/p95 latency, and alerts for 5xx and database failures. Validate telemetry and privacy behavior in a deployed environment before claiming end-to-end monitoring.
