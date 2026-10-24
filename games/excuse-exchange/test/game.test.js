"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { WebSocket } = require("ws");
const { server, rooms } = require("../server.js");
let port;
const clients = [];
test.before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  port = server.address().port;
});
test.after(async () => {
  for (const ws of clients) ws.terminate();
  await new Promise(resolve => server.close(resolve));
});
async function socket() {
  const ws = new WebSocket("ws://127.0.0.1:" + port + "/ws");
  clients.push(ws);
  await once(ws, "open");
  return ws;
}
function post(ws, message) { ws.send(JSON.stringify(message)); }
function waitFor(ws, predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error("WebSocket message timed out"));
    }, timeout);
    function onMessage(bytes) {
      let data;
      try { data = JSON.parse(bytes.toString()); } catch { return; }
      if (!predicate(data)) return;
      clearTimeout(timer); ws.off("message", onMessage); resolve(data);
    }
    ws.on("message", onMessage);
  });
}
function uid() { return "t-" + Math.random().toString(36).slice(2) + "-" + Date.now(); }

test("demo completes five live rounds and returns a final leaderboard", async () => {
  const ws = await socket();
  post(ws, { type: "create", name: "Player One", token: uid(), demo: true });
  const joined = await waitFor(ws, p => p.type === "joined");
  const lobby = await waitFor(ws, p => p.type === "state" && p.phase === "lobby");
  assert.equal(lobby.players.length, 4);
  assert.match(joined.room, /^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(lobby.isHost, true);
  post(ws, { type: "start" });
  for (let round = 1; round <= 5; round++) {
    const writing = await waitFor(ws, p => p.type === "state" && p.phase === "write" && p.round === round);
    assert.ok(writing.prompt && writing.wildcard);
    post(ws, { type: "submit", text: "The " + writing.wildcard + " did it, Your Honour. I was at lunch." });
    const voting = await waitFor(ws, p => p.type === "state" && p.phase === "vote" && p.round === round);
    assert.equal(voting.choices.length, 4);
    assert.equal(voting.answerCount, 4);
    const opponent = voting.choices.find(p => p.id !== voting.yourAnswerId);
    post(ws, { type: "vote", answerId: opponent.id });
    const result = await waitFor(ws, p => p.type === "state" && p.phase === "reveal" && p.round === round);
    assert.equal(result.results.length, 4);
    assert.equal(result.results.reduce((a, p) => a + p.votes, 0), 4);
    assert.ok(result.results.some(p => p.author === "Player One" && p.bonus === 1));
    post(ws, { type: "next" });
  }
  const final = await waitFor(ws, p => p.type === "state" && p.phase === "final");
  assert.equal(final.round, 5);
  assert.equal(final.players.length, 4);
});

test("three connected players synchronize and self-votes are rejected", async () => {
  const a = await socket(), b = await socket(), c = await socket();
  const ids = [uid(), uid(), uid()];
  post(a, { type: "create", name: "Alice", token: ids[0] });
  const { room } = await waitFor(a, p => p.type === "joined");
  await waitFor(a, p => p.type === "state" && p.phase === "lobby");
  post(b, { type: "join", room, name: "Bob", token: ids[1] });
  await waitFor(b, p => p.type === "joined");
  await waitFor(b, p => p.type === "state");
  post(c, { type: "join", room, name: "Cory", token: ids[2] });
  await waitFor(c, p => p.type === "joined");
  const lobby = await waitFor(c, p => p.type === "state");
  assert.equal(lobby.players.length, 3);
  post(a, { type: "start" });
  await Promise.all([a,b,c].map(ws => waitFor(ws, p => p.type === "state" && p.phase === "write")));
  post(a, { type: "submit", text: "I thought the printer was a submarine." });
  post(b, { type: "submit", text: "The office hamster signed the forms." });
  post(c, { type: "submit", text: "Ask the goat in accounting, not me." });
  const [va, vb, vc] = await Promise.all([a,b,c].map(ws => waitFor(ws, p => p.type === "state" && p.phase === "vote")));
  assert.deepEqual(va.choices.map(p => p.id), vb.choices.map(p => p.id));
  assert.equal(va.choices.length, 3);
  post(a, { type: "vote", answerId: va.yourAnswerId });
  const refusal = await waitFor(a, p => p.type === "error");
  assert.match(refusal.message, /another player/);
  post(a, { type: "vote", answerId: va.choices.find(p => p.id !== va.yourAnswerId).id });
  post(b, { type: "vote", answerId: vb.choices.find(p => p.id !== vb.yourAnswerId).id });
  post(c, { type: "vote", answerId: vc.choices.find(p => p.id !== vc.yourAnswerId).id });
  const [ra, rb, rc] = await Promise.all([a,b,c].map(ws => waitFor(ws, p => p.type === "state" && p.phase === "reveal")));
  assert.equal(ra.results.reduce((n, r) => n + r.votes, 0), 3);
  assert.deepEqual(ra.results, rb.results);
  assert.deepEqual(ra.results, rc.results);
  assert.equal(rooms.get(room).round, 1);
});
