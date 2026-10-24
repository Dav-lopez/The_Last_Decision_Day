"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { WebSocket } = require("ws");
const { server, rooms } = require("../server.js");
let port;
const clients = [];
const cache = new WeakMap();
const callbacks = new WeakMap();

test.before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  port = server.address().port;
});
test.after(async () => {
  for (const ws of clients) ws.terminate();
  await new Promise(resolve => server.close(resolve));
});
async function client() {
  const ws = new WebSocket("ws://127.0.0.1:" + port + "/ws");
  clients.push(ws); cache.set(ws, []); callbacks.set(ws, new Set());
  ws.on("message", raw => {
    let packet;
    try { packet = JSON.parse(raw.toString()); } catch { return; }
    const buffer = cache.get(ws); buffer.push(packet);
    if (buffer.length > 100) buffer.shift();
    for (const cb of [...callbacks.get(ws)]) cb();
  });
  await once(ws, "open");
  return ws;
}
function post(ws, msg) { ws.send(JSON.stringify(msg)); }
function next(ws, predicate, ms = 4000) {
  return new Promise((resolve, reject) => {
    const buffer = cache.get(ws);
    function consume() {
      const i = buffer.findIndex(predicate);
      if (i < 0) return;
      clearTimeout(timer); callbacks.get(ws).delete(consume);
      resolve(buffer.splice(i, 1)[0]);
    }
    callbacks.get(ws).add(consume);
    const timer = setTimeout(() => {
      callbacks.get(ws).delete(consume);
      reject(new Error("Timed out, cached packets: " + buffer.map(p => p.type + ":" + (p.phase || "")).join(",")));
    }, ms);
    consume();
  });
}

test("demo can complete a five-round game with bot votes and final scores", async () => {
  const ws = await client();
  post(ws, { type: "create", name: "Demo Human", demo: true });
  const joined = await next(ws, p => p.type === "joined");
  assert.match(joined.room, /^[A-HJ-NP-Z2-9]{5}$/);
  const lobby = await next(ws, p => p.type === "state" && p.phase === "lobby");
  assert.equal(lobby.players.length, 4);
  assert.equal(lobby.isHost, true);
  post(ws, { type: "start" });
  for (let round = 1; round <= 5; round++) {
    const voting = await next(ws, p => p.type === "state" && p.phase === "voting" && p.round === round);
    assert.ok(voting.question.includes("?"));
    assert.ok(voting.deadline > Date.now());
    const target = voting.players.find(p => p.id !== voting.you && p.bot);
    post(ws, { type: "vote", target: target.id });
    const revealed = await next(ws, p => p.type === "state" && p.phase === "reveal" && p.round === round);
    assert.equal(revealed.votedCount, 4);
    assert.equal(Object.values(revealed.tally).reduce((x,y) => x+y, 0), 4);
    assert.ok(revealed.roundWinners.length >= 1);
    post(ws, { type: "next" });
  }
  const final = await next(ws, p => p.type === "state" && p.phase === "finished");
  assert.equal(final.players.reduce((n,p) => n+p.score, 0), 20);
  assert.equal(final.round, 5);
});

test("three human clients see the same question and self-voting is blocked", async () => {
  const a = await client(), b = await client(), c = await client();
  post(a, { type: "create", name: "Alice" });
  const { room } = await next(a, p => p.type === "joined");
  await next(a, p => p.type === "state" && p.phase === "lobby");
  post(b, { type: "join", room, name: "Bob" });
  const joinedB = await next(b, p => p.type === "joined");
  await next(b, p => p.type === "state" && p.phase === "lobby");
  post(c, { type: "join", room, name: "Cleo" });
  const joinedC = await next(c, p => p.type === "joined");
  const lobby = await next(c, p => p.type === "state" && p.phase === "lobby");
  assert.equal(lobby.players.length, 3);
  post(a, { type: "start" });
  const [av, bv, cv] = await Promise.all([a,b,c].map(ws => next(ws, p => p.type === "state" && p.phase === "voting")));
  assert.equal(av.question, bv.question);
  assert.equal(av.question, cv.question);
  post(a, { type: "vote", target: av.you });
  const invalid = await next(a, p => p.type === "error");
  assert.match(invalid.message, /another player/i);
  post(a, { type: "vote", target: joinedB.token });
  post(b, { type: "vote", target: joinedC.token });
  post(c, { type: "vote", target: av.you });
  const [ar, br, cr] = await Promise.all([a,b,c].map(ws => next(ws, p => p.type === "state" && p.phase === "reveal")));
  assert.deepEqual(ar.tally, br.tally);
  assert.deepEqual(ar.tally, cr.tally);
  assert.equal(ar.votedCount, 3);
  assert.equal(ar.players.reduce((n,p) => n+p.score, 0), 3);
  assert.equal(rooms.get(room).round, 1);
});
