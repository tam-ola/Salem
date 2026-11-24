// The single most important test in the project (CLAUDE.md): 90 simulated
// days of answers, asserting the daily review load stays bounded and no card
// is lost or duplicated.

import { test, assert, equal } from './assert.js';
import { loadLibrary } from './fixtures.js';
import { simulate, summarize } from './simulate.js';
import * as S from '../src/scheduler.js';

const G = 'simulation (90 days)';
export const reports = []; // picked up by the runner for display

// Bound on the items due at the start of any day. New material stops above
// BACKLOG_GATE (25); what can come due beyond that is reviews of cards already
// in rotation. A due count past gate + one full session would mean the gate
// is not containing the load.
const LOAD_BOUND = S.BACKLOG_GATE + S.SESSION_SIZE; // 37

function checkCommon(name, res, { days = 90 } = {}) {
  equal(res.violations, [], `${name}: invariant violations`);
  equal(res.log.length, days);
  // No card lost: every introduced verse keeps its ref2text card, and every
  // live card is scheduled.
  const ids = res.cards.map((c) => c.id);
  equal(new Set(ids).size, ids.length, 'no duplicate cards');
  const introduced = res.log.reduce((s, r) => s + r.newVerses, 0);
  equal(res.cards.filter((c) => c.skill === 'ref2text').length, introduced, 'one ref2text card per introduced verse');
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function scenario(name, opts, extra) {
  test(G, name, async () => {
    const library = await loadLibrary();
    const res = simulate(library, { days: 90, ...opts });
    reports.push({ name, opts, log: res.log, weekly: summarize(res.log) });
    checkCommon(name, res);
    extra?.(res);
  });
}

const steady = (res) => {
  const due = res.log.map((r) => r.dueAtStart);
  const max = Math.max(...due);
  assert(max <= LOAD_BOUND, `max due at start of day ${max} > ${LOAD_BOUND}`);
  // Not drifting upward at the end: the last fortnight is no heavier than
  // the fortnight a month earlier, plus a margin of one session.
  const late = mean(due.slice(76, 90));
  const earlier = mean(due.slice(46, 60));
  assert(late <= earlier + S.SESSION_SIZE, `due trending up: ${earlier.toFixed(1)} -> ${late.toFixed(1)}`);
  // No card starves behind the overdue cap.
  const starve = Math.max(...res.log.map((r) => r.oldestOverdueDays));
  assert(starve <= 14, `a card waited ${starve} days past due`);
};

scenario('daily, words only (phase 1 configuration)', { skills: ['ref2text'] }, (res) => {
  steady(res);
  const verses = res.log.at(-1).verses;
  assert(verses >= 60, `progress continues: ${verses} verses introduced`);
  assert(res.log.at(-1).held >= 20, `verses held by day 90: ${res.log.at(-1).held}`);
});

scenario('daily, all three skills', { skills: S.SKILLS }, steady);

scenario('twice a day, all three skills', { skills: S.SKILLS, sessionHours: [7, 20] }, steady);

scenario('struggling learner (70% recall), all three skills', { skills: S.SKILLS, learningP: 0.7, reviewP: 0.7 }, steady);

scenario('away for 10 days (days 31–40), all three skills', { skills: S.SKILLS, skipDays: [30, 31, 32, 33, 34, 35, 36, 37, 38, 39] }, (res) => {
  const back = res.log[40];
  equal(back.kinds[0], 'comeback', 'return day opens with the comeback check-in');
  equal(back.items, S.COMEBACK_SIZE);
  equal(back.newVerses, 0, 'no new verses on the comeback day');
  // While the backlog is above the gate, nothing new is introduced.
  for (const r of res.log) if (r.dueAtStart > S.BACKLOG_GATE) equal(r.newVerses, 0, `day ${r.day}`);
  // Recovers: within three weeks of returning the load is back under the gate.
  const recovered = res.log.slice(40, 61).some((r) => r.dueAtStart <= S.BACKLOG_GATE);
  assert(recovered, 'backlog back under the gate within 3 weeks');
  const late = res.log.slice(76).map((r) => r.dueAtStart);
  assert(Math.max(...late) <= LOAD_BOUND, `final fortnight max due ${Math.max(...late)}`);
});

scenario('every other day, all three skills', { skills: S.SKILLS, skipDays: Array.from({ length: 45 }, (_, i) => i * 2 + 1) }, (res) => {
  const due = res.log.map((r) => r.dueAtStart);
  assert(Math.max(...due) <= LOAD_BOUND + S.SESSION_SIZE, `max due ${Math.max(...due)}`);
  const late = mean(due.slice(76, 90));
  const earlier = mean(due.slice(46, 60));
  assert(late <= earlier + S.SESSION_SIZE, `due trending up: ${earlier.toFixed(1)} -> ${late.toFixed(1)}`);
});
