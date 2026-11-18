// Minimal assertions. No framework.
export const registry = [];
export function test(group, name, fn) { registry.push({ group, name, fn }); }

export class AssertionError extends Error {}
export function assert(cond, msg = 'assertion failed') { if (!cond) throw new AssertionError(msg); }
export function equal(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new AssertionError(`${msg ? msg + ': ' : ''}expected ${e}, got ${a}`);
}
export function near(actual, expected, tol, msg = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new AssertionError(`${msg ? msg + ': ' : ''}expected ${expected} ±${tol}, got ${actual}`);
}
