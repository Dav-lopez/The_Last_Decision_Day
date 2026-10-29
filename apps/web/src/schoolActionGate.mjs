/** Keep asynchronous school previews and executions scoped to the active session. */
export function createSchoolActionGate() {
  let session = 0;
  let preview = 0;
  let executing = false;

  function beginPreview() {
    if (executing) return null;
    return { session, request: ++preview };
  }

  function isCurrentPreview(ticket) {
    return !executing && ticket.session === session && ticket.request === preview;
  }

  function beginExecution() {
    if (executing) return null;
    executing = true;
    preview++;
    return session;
  }

  function isCurrentSession(ticket) {
    return ticket === session;
  }

  function endExecution(ticket) {
    if (ticket === session) executing = false;
  }

  function resetSession() {
    session++;
    preview++;
    executing = false;
  }

  return { beginPreview, isCurrentPreview, beginExecution, isCurrentSession, endExecution, resetSession };
}
