// Progress that is derived, never stored: the watering streak with rest days,
// and each verse's growth stage. See SPEC.md §10.

import { isHeld, dayKey, DAY } from './scheduler.js';

export const REST_DAYS = 2; // per rolling 30 days
const WINDOW = 30;

const keyToMs = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
const addDays = (key, n) => { const t = new Date(keyToMs(key)); t.setDate(t.getDate() + n); return dayKey(t.getTime()); };

// sessionDays: day keys on which a session was completed.
// Returns { days, restUsed, restLeft, today, week } where week is the last 7
// days, oldest first, each 'watered' | 'rest' | 'open' | 'today'.
export function streak(sessionDays, now) {
  const done = new Set(sessionDays);
  const today = dayKey(now);
  const status = new Map();
  let days = 0;
  const restDates = [];
  // Today not yet watered does not break anything.
  let cursor = done.has(today) ? today : addDays(today, -1);
  if (done.has(today)) status.set(today, 'watered');
  for (let guard = 0; guard < 3650; guard++) {
    if (done.has(cursor)) {
      days++;
      status.set(cursor, 'watered');
    } else {
      const recent = restDates.filter((r) => keyToMs(r) - keyToMs(cursor) < WINDOW * DAY);
      const earlier = [...done].some((d) => d < cursor);
      if (!earlier || recent.length >= REST_DAYS) break;
      restDates.push(cursor);
      status.set(cursor, 'rest');
    }
    cursor = addDays(cursor, -1);
  }
  // Rest days only count when they bridge two watered days.
  const watered = [...status].filter(([, v]) => v === 'watered').map(([k]) => k).sort();
  const oldest = watered[0];
  for (const r of restDates.slice()) {
    if (!oldest || r < oldest) { status.delete(r); restDates.splice(restDates.indexOf(r), 1); }
  }
  const inWindow = restDates.filter((r) => keyToMs(today) - keyToMs(r) < WINDOW * DAY).length;
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const k = addDays(today, -i);
    week.push({ key: k, state: status.get(k) ?? (k === today ? 'today' : 'open') });
  }
  return { days, restLeft: Math.max(0, REST_DAYS - inWindow), wateredToday: done.has(today), week };
}

// planted (new), rooted (learning), growing (review), held. Index 0-3.
export const STAGES = ['planted', 'rooted', 'growing', 'held'];
export function stageOf(card) {
  if (!card || card.state === 'new') return 0;
  if (isHeld(card)) return 3;
  if (card.state === 'review') return 2;
  return 1;
}
