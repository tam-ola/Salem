import { test, assert, equal, near } from './assert.js';
import { loadLibrary } from './fixtures.js';
import * as S from '../src/scheduler.js';

const G = 'scheduler';
const T0 = new Date(2026, 4, 4, 7, 0).getTime(); // a Monday morning, local time
const SLOW = { durationMs: 60_000 };
const ok = (card, at) => S.answerCard(card, { correct: true, ...SLOW }, at);
const bad = (card, at) => S.answerCard(card, { correct: false, ...SLOW }, at);

// Drive a card through learning into review, answering each time it is due.
function toReview(id = 'psa-16-1') {
  let c = S.createCard(id, 'ref2text', T0);
  c = ok(c, T0); // new -> learning step 0
  c = ok(c, c.due); // -> step 1
  c = ok(c, c.due); // -> review, ladder 0
  return c;
}

test(G, 'new card enters learning at the 10-minute step', () => {
  const c = ok(S.createCard('psa-16-1', 'ref2text', T0), T0);
  equal([c.state, c.step], ['learning', 0]);
  near(c.due - T0, 10 * S.MINUTE, 10 * S.MINUTE * S.JITTER + 1);
});

test(G, 'learning: correct advances a step, wrong repeats it', () => {
  let c = ok(S.createCard('psa-16-1', 'ref2text', T0), T0);
  const again = bad(c, c.due);
  equal([again.state, again.step], ['learning', 0]);
  c = ok(c, c.due);
  equal(c.step, 1);
  near(c.interval, 1, 1e-9, 'second step is 1 day');
  c = ok(c, c.due);
  equal([c.state, c.ladderPos, c.interval], ['review', 0, 1]);
});

test(G, 'review ladder at starting ease, answered on time', () => {
  let c = toReview();
  const seen = [c.interval];
  for (let i = 0; i < 8; i++) { c = ok(c, c.due); seen.push(Math.round(c.interval * 100) / 100); }
  equal(seen, [1, 3, 7, 16, 35, 75, 160, 350, 350]);
});

test(G, 'interval is capped at 400 days', () => {
  let c = { ...toReview(), ease: S.EASE_MAX, ladderPos: 6 };
  c = ok(c, c.due);
  equal(c.interval, 400, '350 * 2.8 / 2.3 = 426 -> 400');
});

test(G, 'quick correct answers nudge ease, capped at 2.8', () => {
  let c = toReview();
  c = S.answerCard(c, { correct: true, durationMs: 3000, span: 1 }, c.due);
  near(c.ease, 2.35, 1e-9);
  const slow = S.answerCard(toReview(), { correct: true, durationMs: 9000, span: 1 }, T0 + 3 * S.DAY);
  equal(slow.ease, 2.3, 'not quick');
  const passage = S.answerCard(toReview(), { correct: true, durationMs: 20000, span: 3 }, T0 + 3 * S.DAY);
  near(passage.ease, 2.35, 1e-9, '8s per verse for a 3-verse passage');
  for (let i = 0; i < 30; i++) c = S.answerCard(c, { correct: true, durationMs: 1000 }, c.due);
  equal(c.ease, S.EASE_MAX);
});

test(G, 'a lapse drops two ladder positions, not to zero', () => {
  let c = toReview();
  for (let i = 0; i < 5; i++) c = ok(c, c.due); // ladder 5 (75 days)
  equal(c.ladderPos, 5);
  const lapsed = bad(c, c.due);
  equal([lapsed.state, lapsed.step, lapsed.ladderPos, lapsed.lapses], ['learning', 1, 3, 1]);
  near(lapsed.ease, 2.1, 1e-9);
  near(lapsed.interval, 1, 1e-9, 're-enters learning at the last (1 day) step');
  const back = ok(lapsed, lapsed.due);
  equal([back.state, back.ladderPos], ['review', 3]);
  near(back.interval, (16 * 2.1) / 2.3, 1e-9, 'resumes at ladder 3 (16 days scaled by ease)');
});

test(G, 'a lapse at ladder 1 drops to 0, never below', () => {
  let c = ok(toReview(), T0 + S.DAY * 3);
  equal(c.ladderPos, 1);
  equal(bad(c, c.due).ladderPos, 0);
});

test(G, 'ease never falls below 1.3', () => {
  let c = toReview();
  for (let i = 0; i < 10; i++) { c = bad(c, c.due); c = ok(c, c.due); }
  equal(c.ease, S.EASE_MIN);
});

test(G, 'due is jittered within ±6% and deterministically', () => {
  let c = toReview();
  for (let i = 0; i < 4; i++) c = ok(c, c.due);
  const at = c.due;
  const a = ok(c, at);
  const b = ok(c, at);
  equal(a.due, b.due, 'same inputs, same due');
  const ratio = (a.due - at) / (a.interval * S.DAY);
  assert(ratio >= 0.94 && ratio <= 1.06, `ratio ${ratio}`);
  const spread = new Set(['psa-16-1', 'psa-30-10', 'psa-34-7', 'psa-34-8'].map((id) => toReview(id).due));
  assert(spread.size > 1, 'cards introduced together do not share a due time');
});

test(G, 'recall after a long gap jumps to the rung that covers it', () => {
  let c = ok(toReview(), T0 + 3 * S.DAY); // ladder 1, 3 days
  equal(c.ladderPos, 1);
  const late = ok(c, c.lastSeen + 30 * S.DAY);
  equal(late.ladderPos, 4, 'jumps to 35 days, not 7');
});

test(G, 'held: ref2text interval >= 21 and clean last two reviews; lost on lapse', () => {
  let c = toReview();
  while (c.interval < 21) { assert(!S.isHeld(c)); c = ok(c, c.due); }
  assert(S.isHeld(c), 'held at 35 days');
  const lapsed = bad(c, c.due);
  assert(!S.isHeld(lapsed), 'lapse removes held immediately');
  const t2r = { ...c, skill: 'text2ref', id: 'x:text2ref' };
  assert(!S.isHeld(t2r), 'only ref2text counts');
});

test(G, 'isDue: day-scale cards are due all of their due day; minute steps only once elapsed', () => {
  const learning = ok(S.createCard('psa-16-1', 'ref2text', T0), T0);
  assert(!S.isDue(learning, T0 + 5 * S.MINUTE));
  assert(S.isDue(learning, T0 + 11 * S.MINUTE));
  const review = { ...toReview(), interval: 3, due: T0 + 3 * S.DAY + 10 * 3600e3 };
  assert(S.isDue(review, T0 + 3 * S.DAY), 'due at 17:00, session at 07:00 same day');
  assert(!S.isDue(review, T0 + 2 * S.DAY));
});

// ---------------------------------------------------------------- assembly

const reviewCard = (verseId, dueAt, extra = {}) => ({
  ...S.createCard(verseId, 'ref2text', dueAt - 10 * S.DAY),
  state: 'review', interval: 7, ladderPos: 2, reps: 5, lastSeen: dueAt - 7 * S.DAY, due: dueAt, ...extra,
});

test(G, 'first session introduces the first two starter-path verses', async () => {
  const library = await loadLibrary();
  const ctx = S.makeContext({ library, cards: [] });
  const s = S.assembleSession(ctx, T0);
  equal(s.kind, 'daily');
  equal(s.items.map((i) => i.card.verseId).sort(), library.starter_path.slice(0, 2).sort());
  assert(s.items.every((i) => i.isNew && i.card.skill === 'ref2text'));
});

test(G, 'classic path is used when selected', async () => {
  const library = await loadLibrary();
  const s = S.assembleSession(S.makeContext({ library, cards: [], settings: { path: 'classic' } }), T0);
  equal(s.items.map((i) => i.card.verseId).sort(), library.classic_path.slice(0, 2).sort());
});

test(G, 'daily new cap counts verses already introduced today', async () => {
  const library = await loadLibrary();
  const first = S.createCard(library.starter_path[0], 'ref2text', T0 - 3600e3);
  const s = S.assembleSession(S.makeContext({ library, cards: [S.answerCard(first, { correct: true }, T0 - 3600e3)] }), T0);
  const fresh = s.items.filter((i) => i.isNew);
  equal(fresh.map((i) => i.card.verseId), [library.starter_path[1]], 'one more today, not two');
});

test(G, 'no new verses when more than 25 items are due', async () => {
  const library = await loadLibrary();
  const ids = library.verses.filter((v) => v.track === 'verse').slice(0, 26).map((v) => v.id);
  const cards = ids.map((id) => reviewCard(id, T0 - S.DAY));
  const s = S.assembleSession(S.makeContext({ library, cards }), T0);
  assert(!s.items.some((i) => i.isNew), 'gate closed at 26 due');
  const s2 = S.assembleSession(S.makeContext({ library, cards: cards.slice(0, 25) }), T0);
  assert(s2.items.some((i) => i.isNew), 'gate open at 25');
});

test(G, 'overdue reviews: at most 8, most overdue first, session capped at 12', async () => {
  const library = await loadLibrary();
  const ids = library.verses.filter((v) => v.track === 'verse').slice(0, 30).map((v) => v.id);
  const overdue = ids.slice(0, 20).map((id, k) => reviewCard(id, T0 - (k + 2) * S.DAY));
  const today = ids.slice(20).map((id) => reviewCard(id, T0 + 3600e3));
  const s = S.assembleSession(S.makeContext({ library, cards: [...overdue, ...today] }), T0);
  equal(s.items.length, 12);
  const got = new Set(s.items.map((i) => i.card.id));
  const chosenOverdue = overdue.filter((c) => got.has(c.id));
  equal(chosenOverdue.length, 8);
  equal(chosenOverdue.map((c) => c.id).sort(), overdue.slice(12).map((c) => c.id).sort(), 'the 8 oldest');
  equal(new Set(s.items.map((i) => i.card.id)).size, s.items.length, 'no duplicates');
});

test(G, 'reflection items never enter a session, even with cards due', async () => {
  const library = await loadLibrary();
  const reflection = library.verses.filter((v) => v.track === 'reflection');
  equal(reflection.length, 23);
  const cards = reflection.map((v) => reviewCard(v.id, T0 - S.DAY));
  const s = S.assembleSession(S.makeContext({ library, cards }), T0);
  assert(!s.items.some((i) => reflection.some((v) => v.id === i.card.verseId)));
  const many = S.nextNewVerses(S.makeContext({ library, cards: [] }), 1000);
  assert(!many.some((v) => v.track === 'reflection'), 'never offered as new material');
  equal(many.length, 531 + 53, 'every verse and passage is reachable');
});

test(G, 'after the starter path, personal verses come before public ones', async () => {
  const library = await loadLibrary();
  const order = S.nextNewVerses(S.makeContext({ library, cards: [] }), 1000);
  equal(order.slice(0, 20).map((v) => v.id), library.starter_path);
  const rest = order.slice(20);
  const firstPublic = rest.findIndex((v) => v.collection === 'public');
  assert(rest.slice(firstPublic).every((v) => v.collection === 'public'), 'all personal first');
});

test(G, 'archived verses are skipped and do not break progression', async () => {
  const library = await loadLibrary();
  const meta = [{ verseId: library.starter_path[0], archived: true }];
  const order = S.nextNewVerses(S.makeContext({ library, cards: [], meta }), 2);
  equal(order.map((v) => v.id), library.starter_path.slice(1, 3));
});

test(G, 'comeback check-in after 7+ days away with 10+ overdue', async () => {
  const library = await loadLibrary();
  const ids = library.verses.filter((v) => v.track === 'verse').slice(0, 12).map((v) => v.id);
  const cards = ids.map((id, k) => reviewCard(id, T0 - (k + 1) * S.DAY));
  const ctx = S.makeContext({ library, cards });
  const s = S.assembleSession(ctx, T0, { lastSessionAt: T0 - 8 * S.DAY });
  equal(s.kind, 'comeback');
  equal(s.items.length, 8);
  equal(s.items.map((i) => i.card.id), cards.slice().sort((a, b) => a.due - b.due).slice(0, 8).map((c) => c.id), 'most overdue first');
  equal(S.assembleSession(ctx, T0, { lastSessionAt: T0 - 6 * S.DAY }).kind, 'daily', '6 days is not a comeback');
  const fewer = S.makeContext({ library, cards: cards.slice(0, 9) });
  equal(S.assembleSession(fewer, T0, { lastSessionAt: T0 - 8 * S.DAY }).kind, 'daily', '9 overdue is not a comeback');
});

test(G, 'reference skills are staged and only for enabled skills', async () => {
  const library = await loadLibrary();
  const id = library.starter_path[0];
  const r2t = reviewCard(id, T0 + 5 * S.DAY);
  let ctx = S.makeContext({ library, cards: [r2t] });
  equal(S.pendingSkillCards(ctx), [{ verseId: id, skill: 'book' }]);
  const only = S.makeContext({ library, cards: [r2t], settings: { skills: ['ref2text'] } });
  equal(S.pendingSkillCards(only), [], 'phase 1: words only');
  const book = { ...reviewCard(id, T0 + 5 * S.DAY), id: S.cardId(id, 'book'), skill: 'book' };
  ctx = S.makeContext({ library, cards: [r2t, book] });
  equal(S.pendingSkillCards(ctx), [{ verseId: id, skill: 'text2ref' }]);
  const t2r = { ...reviewCard(id, T0 + 5 * S.DAY), id: S.cardId(id, 'text2ref'), skill: 'text2ref' };
  const retired = S.retirements([r2t, book, t2r]);
  equal(retired.map((c) => [c.id, c.retired]), [[book.id, true]]);
});

test(G, 'extra practice draws only on held verses and is offered when short', async () => {
  const library = await loadLibrary();
  const [a, b] = library.starter_path;
  const held = reviewCard(a, T0 + 20 * S.DAY, { interval: 35, recent: [true, true] });
  const notHeld = reviewCard(b, T0 + 2 * S.DAY, { interval: 7, recent: [true, true] });
  const ctx = S.makeContext({ library, cards: [held, notHeld], settings: { dailyNewCap: 0 } });
  equal(S.assembleSession(ctx, T0).items.length, 0);
  equal(S.assembleExtraPractice(ctx, T0).items.map((i) => i.card.id), [held.id]);
});

test(G, 'exercise type follows state and interval', () => {
  const c = S.createCard('x', 'ref2text', T0);
  equal(S.exerciseFor(c), 'wordbank');
  equal(S.exerciseFor({ ...c, state: 'learning' }), 'wordbank');
  equal(S.exerciseFor({ ...c, state: 'review', interval: 3 }), 'blanks30');
  equal(S.exerciseFor({ ...c, state: 'review', interval: 10 }), 'blanks60');
  equal(S.exerciseFor({ ...c, state: 'review', interval: 21 }), 'firstletter');
  equal(S.exerciseFor({ ...c, skill: 'book' }), 'refchoice');
});
