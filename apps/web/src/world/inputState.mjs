/** Track each keyboard/pointer source separately so one release cannot cancel another hold. */
export function createMovementInput() {
  const sources = new Map();
  const pressed = new Set();

  function release(source) {
    const key = sources.get(source);
    if (key === undefined) return;
    sources.delete(source);
    if (![...sources.values()].includes(key)) pressed.delete(key);
  }

  function press(source, key) {
    if (sources.get(source) === key) return;
    release(source);
    sources.set(source, key);
    pressed.add(key);
  }

  function clear() {
    sources.clear();
    pressed.clear();
  }

  return { pressed, press, release, clear };
}
