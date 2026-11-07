/**
 * Police patrol calls (open-world 16b). A patrol shift (careerTasks.mjs) now carries one call from dispatch on its
 * second stop: a lost child to walk back to their dad, a car with a dead brake light to pull over, or loud music to
 * have a word about. At the call you choose how to handle it (three answers, keys 1–3); the way you treat people is
 * graded and paid on top of the patrol's own time bonus. No crime gameplay: these are everyday community calls.
 *
 * Pure: the scene draws the people and the car (policeCallScene.ts), WorldScene holds the patrol at the call's stop
 * until `stepCall` / `chooseCall` say it is resolved, then `resolveCall` moves the patrol on. City-local metres.
 */

export const CALL_REACH = 5;          // metres from the call to start talking (on foot)
export const CALL_SECONDS = 20;       // extra par for talking it through
export const ESCORT_PACE = 1.6;       // par pace walking a child (m/s): slower than a jog
export const FOLLOW_GAP = 1.4;        // how far behind you the child walks
const FOLLOW_SPEED = 3.4;             // the child's fastest walk (m/s) catching up
const FOLLOW_SNAP = 25;               // further than this (you ran off), the child catches up at once
const PARENT_REACH = 5;               // metres from the parent to hand the child over

/** Grades by how you treated people: the best answer is calm, kind and clear. */
export const CONDUCT = Object.freeze({
  best: Object.freeze({ id: 'best', title: 'Commended', share: 0.4 }),
  ok: Object.freeze({ id: 'ok', title: 'Handled', share: 0.2 }),
  poor: Object.freeze({ id: 'poor', title: 'Complaint filed', share: 0 }),
});

export const CALLS = Object.freeze({
  'lost-child': Object.freeze({
    id: 'lost-child', title: 'Lost child',
    dispatch: 'Dispatch: a little boy has lost his dad on the patrol route. Find him at the next stop.',
    arrive: 'A small boy is crying by the bench: "I can\'t find my dad."',
    options: Object.freeze([
      Object.freeze({ tone: 'best', text: 'Kneel down: "I\'m a police officer. Let\'s find your dad together. What\'s his name?"',
        reply: '"Sam… he\'s got a red jacket." He takes your hand.' }),
      Object.freeze({ tone: 'ok', text: '"Stay right here. I\'ll radio it in."',
        reply: 'He nods but keeps crying. Dispatch: his dad is waiting up the street. Better walk him there.' }),
      Object.freeze({ tone: 'poor', text: '"Where are your parents? You shouldn\'t wander off."',
        reply: 'He cries harder. A passer-by calms him down: his dad, Sam, wears a red jacket.' }),
    ]),
    escort: 'Walk him to his dad up the street: follow the beam. He\'ll keep up.',
    resolved: '"Leo!" His dad scoops him up: "Thank you, officer."',
  }),
  'traffic-stop': Object.freeze({
    id: 'traffic-stop', title: 'Traffic stop',
    dispatch: 'Dispatch: a hatchback with a dead brake light has pulled over for you on the patrol route. Have a word with the driver.',
    arrive: 'The driver winds the window down, nervous: "Is something wrong, officer?"',
    options: Object.freeze([
      Object.freeze({ tone: 'best', text: '"Good afternoon. Your brake light is out. Here\'s a fix-it slip: get it sorted this week."',
        reply: '"Thanks, officer, I had no idea. I\'ll get it done tomorrow." They pull away carefully.' }),
      Object.freeze({ tone: 'ok', text: '"Licence and registration, please." Check them, then wave them on.',
        reply: 'Everything checks out. They drive off a little puzzled about why they were stopped.' }),
      Object.freeze({ tone: 'poor', text: '"Do you know how dangerous that is? Get it fixed now."',
        reply: 'They go red and drive off without a word. Someone on the pavement shakes their head.' }),
    ]),
    resolved: null,
  }),
  'noise-complaint': Object.freeze({
    id: 'noise-complaint', title: 'Noise complaint',
    dispatch: 'Dispatch: neighbours report loud music from a flat above the shops on the patrol route.',
    arrive: 'You knock. The music drops a little and someone opens the door, party hat on: "Hi?"',
    options: Object.freeze([
      Object.freeze({ tone: 'best', text: '"Evening! The neighbours are trying to sleep. Could you turn it down a bit?"',
        reply: '"Sorry! It\'s my birthday. We\'ll keep it down." The music drops to a murmur.' }),
      Object.freeze({ tone: 'ok', text: '"Turn it down, or I\'ll have to write it up."',
        reply: '"Fine." The door shuts and the music goes quiet.' }),
      Object.freeze({ tone: 'poor', text: '"Party\'s over. Everyone out."',
        reply: 'They argue on the doorstep and the whole street hears it. The music goes off, eventually.' }),
    ]),
    resolved: null,
  }),
});

/** Calls come in turn, so three patrols in a row see all three. */
export const CALL_ORDER = Object.freeze(['lost-child', 'traffic-stop', 'noise-complaint']);
export const callFor = (shiftNumber) => {
  const n = Number.isFinite(Number(shiftNumber)) ? Math.floor(Number(shiftNumber)) : 1;
  return CALL_ORDER[(((n - 1) % CALL_ORDER.length) + CALL_ORDER.length) % CALL_ORDER.length];
};

/** The nearest point on any street to (x, z), with the street's direction there and its lane width. */
export function nearestStreet(graph, x, z) {
  let best = null;
  for (const edge of graph?.edges ?? []) {
    for (let i = 1; i < edge.points.length; i++) {
      const [ax, az] = edge.points[i - 1], [bx, bz] = edge.points[i];
      const vx = bx - ax, vz = bz - az, span = Math.hypot(vx, vz);
      if (span < 0.01) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (span * span)));
      const px = ax + vx * t, pz = az + vz * t;
      const distance = Math.hypot(x - px, z - pz);
      if (!best || distance < best.distance) best = { x: px, z: pz, dx: vx / span, dz: vz / span, lane: edge.lane, distance };
    }
  }
  return best;
}

/**
 * Attach a call to a police patrol: the call is at the second stop (the first on a short route); a lost child's dad
 * waits by the stop after it. Adds the call's time to par. Returns null for other careers or a route too short.
 * @returns {null | { task: object, call: object }}
 */
export function planCall(task, kind, graph = null) {
  const spec = CALLS[kind];
  if (!spec || !task || task.career !== 'police' || task.done) return null;
  const regular = task.stops.filter(stop => !stop.final).length;
  if (regular < 1) return null;
  const stop = regular >= 3 ? 1 : 0;
  const at = task.stops[stop];
  const call = {
    kind, stop, phase: 'travel', x: at.x, z: at.z, tone: null, warnedOnFoot: false, done: false,
    child: null, parent: null, car: null, door: null,
  };
  let extra = CALL_SECONDS;
  if (kind === 'lost-child') {
    // The child stands a step off the stop; dad waits beside the next stop (or back towards the station).
    const after = task.stops[stop + 1];
    const toward = after ?? task.stops.at(-1);
    const dx = toward.x - at.x, dz = toward.z - at.z, length = Math.hypot(dx, dz) || 1;
    // He faces back down the route, the way you'll come.
    call.child = { x: at.x + (dx / length) * 1.2, z: at.z + (dz / length) * 1.2, heading: Math.atan2(dx / length, dz / length), moving: false };
    const parentAt = after && !after.final ? { x: after.x - (dx / length) * 2.5, z: after.z - (dz / length) * 2.5 }
      : { x: at.x + (dx / length) * Math.min(40, length * 0.5), z: at.z + (dz / length) * Math.min(40, length * 0.5) };
    call.parent = { ...parentAt, heading: Math.atan2(dx / length, dz / length) };
    extra += Math.hypot(call.parent.x - at.x, call.parent.z - at.z) * 1.25 / ESCORT_PACE;
  }
  const street = graph ? nearestStreet(graph, at.x, at.z) : null;
  if (kind === 'traffic-stop' && street) {
    // Pulled in at the kerb beside the stop, in the right-hand lane for the side it's on.
    const nx = -street.dz, nz = street.dx;
    const side = Math.sign((at.x - street.x) * nx + (at.z - street.z) * nz) || 1;
    const out = street.lane * 1.4 + 0.3;
    const dx = side > 0 ? -street.dx : street.dx, dz = side > 0 ? -street.dz : street.dz;
    call.car = { x: street.x + nx * out * side, z: street.z + nz * out * side, rotation: Math.atan2(dx, dz) };
  }
  if (kind === 'noise-complaint') {
    // The party is behind the stop, away from the street (towards the shopfronts).
    const ax = street ? at.x - street.x : 0, az = street ? at.z - street.z : 1;
    const length = Math.hypot(ax, az) || 1;
    call.door = { x: at.x + (ax / length) * 1.8, z: at.z + (az / length) * 1.8, heading: Math.atan2(ax / length, az / length) };
  }
  const stops = task.stops.map((s, i) => i === stop ? { ...s, call: kind } : s);
  return { task: { ...task, stops, par: Math.ceil(task.par + extra) }, call };
}

/** Is the patrol held at this call (its stop is next and it isn't resolved)? */
export const holdsTask = (task, call) => Boolean(call && !call.done && task && !task.done && task.next === call.stop);

/** Move the child towards a spot just behind you, catching up at once if you've gone far ahead. */
export function stepFollower(child, leader, seconds) {
  // People face (−sin h, −cos h), so "behind" is (sin h, cos h).
  const gx = leader.x + Math.sin(leader.heading) * FOLLOW_GAP, gz = leader.z + Math.cos(leader.heading) * FOLLOW_GAP;
  const dx = gx - child.x, dz = gz - child.z, distance = Math.hypot(dx, dz);
  if (distance > FOLLOW_SNAP) return { x: gx, z: gz, heading: leader.heading, moving: false };
  const step = Math.min(distance, FOLLOW_SPEED * Math.max(0, Math.min(1, seconds)));
  if (distance < 0.25 || step <= 0) return { ...child, moving: false };
  return { x: child.x + (dx / distance) * step, z: child.z + (dz / distance) * step, heading: Math.atan2(-dx, -dz), moving: true };
}

/**
 * Advance a call with you at (x, z) facing `heading` (radians, the game's own: forward is (−sin, −cos)).
 * Events: `{ type: 'arrive', line }` when you reach it on foot (choose an answer next), `{ type: 'on-foot' }` once if
 * you pull up at the wheel, `{ type: 'resolved', line }` when the child is handed over.
 */
export function stepCall(call, { x, z, heading = 0, seconds = 0, driving = false }) {
  if (!call || call.done || !Number.isFinite(x) || !Number.isFinite(z)) return { call, event: null };
  if (call.phase === 'travel') {
    const reach = driving ? CALL_REACH + 5 : CALL_REACH;
    if (Math.hypot(x - call.x, z - call.z) > reach) return { call, event: null };
    if (driving) return call.warnedOnFoot ? { call, event: null } : { call: { ...call, warnedOnFoot: true }, event: { type: 'on-foot' } };
    return { call: { ...call, phase: 'talk', warnedOnFoot: false }, event: { type: 'arrive', line: CALLS[call.kind].arrive } };
  }
  if (call.phase === 'escort') {
    // The child holds your hand, so they stay put while you're in a car.
    const child = driving ? { ...call.child, moving: false } : stepFollower(call.child, { x, z, heading }, seconds);
    const next = { ...call, child };
    const handedOver = !driving && Math.hypot(x - call.parent.x, z - call.parent.z) <= PARENT_REACH
      && Math.hypot(child.x - call.parent.x, child.z - call.parent.z) <= PARENT_REACH + FOLLOW_GAP + 1.5;
    if (!handedOver) return { call: next, event: null };
    return { call: { ...next, phase: 'done', done: true }, event: { type: 'resolved', line: CALLS[call.kind].resolved } };
  }
  return { call, event: null };
}

/** Answer the call with option 0–2. A lost child then has to be walked to their dad; the others are resolved. */
export function chooseCall(call, index) {
  const spec = call ? CALLS[call.kind] : null;
  const option = spec?.options[index];
  if (!option || call.phase !== 'talk') return { call, event: null };
  const escort = call.kind === 'lost-child';
  const next = { ...call, tone: option.tone, phase: escort ? 'escort' : 'done', done: !escort };
  const line = escort ? `${option.reply} ${spec.escort}` : option.reply;
  return { call: next, event: { type: escort ? 'escort' : 'resolved', tone: option.tone, line } };
}

/** The patrol moves past the call's stop. The stop's own line is replaced by how the call went. */
export function resolveCall(task, call) {
  if (!call?.done || !task || task.next !== call.stop) return task;
  return { ...task, next: call.stop + 1, warnedOnFoot: false };
}

/** Where the patrol's beam and GPS should point for this call (null when the patrol's own stop is right). */
export function callTarget(call) {
  if (!call || call.done) return null;
  if (call.phase === 'escort') return { x: call.parent.x, z: call.parent.z, label: 'Walk him to his dad' };
  return null;
}

/** How the call went and its bonus on top of the shift's pay (none if it was never answered). */
export function callResult(call, basePay) {
  const grade = CONDUCT[call?.tone] ?? null;
  const pay = Math.max(0, Math.floor(Number(basePay) || 0));
  if (!grade || !call.done) return { grade: null, title: 'Call not answered', bonus: 0 };
  return { grade: grade.id, title: grade.title, bonus: Math.round(pay * grade.share) };
}

/** HUD summary for the duty card. */
export function callStatus(call) {
  if (!call) return null;
  const spec = CALLS[call.kind];
  return {
    kind: call.kind, title: spec.title, phase: call.phase, stop: call.stop,
    prompt: call.phase === 'talk' ? spec.arrive : call.phase === 'escort' ? spec.escort : call.phase === 'travel' ? spec.dispatch : null,
    options: call.phase === 'talk' ? spec.options.map(option => option.text) : [],
    grade: CONDUCT[call.tone]?.title ?? null,
  };
}
