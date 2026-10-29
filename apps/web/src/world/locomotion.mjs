const STATES = ['idle', 'walk', 'run'];

export function locomotionState(speed) {
  if (!Number.isFinite(speed) || speed < 0.05) return 'idle';
  return speed > 3.5 ? 'run' : 'walk';
}

/** Time-based weights stay normalized, including when a transition reverses. */
export function blendLocomotion(weights, speed, deltaSeconds) {
  const target = locomotionState(speed);
  const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  const alpha = 1 - Math.exp(-16 * delta);
  const next = Object.fromEntries(STATES.map(state => [state,
    weights[state] + ((state === target ? 1 : 0) - weights[state]) * alpha]));
  return next;
}

export function turnTowards(current, target, deltaSeconds) {
  if (![current, target, deltaSeconds].every(Number.isFinite)) return current;
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-14 * Math.max(0, deltaSeconds)));
}
