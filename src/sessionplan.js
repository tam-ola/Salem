// Turns an assembled session (a list of cards) into the steps the learner
// actually sees. A new verse is taught, not just tested: meet it, order its
// phrases, build it, find it in the Bible, and fill it in once more at the end.
// Only one step per card is graded; everything else is practice and never
// touches the schedule.

import { exerciseFor } from './scheduler.js';
import { phrasesOf } from './phrases.js';

export const MAX_REPEATS = 3;

function reviewStep(card, isNew, kind) {
  const type = exerciseFor(card);
  const base = { verseId: card.verseId, cardId: card.id, newCard: isNew ? card : null, graded: kind !== 'extra' };
  if (type === 'refchoice') return { ...base, kind: card.skill === 'book' ? 'book' : 'ref' };
  if (type === 'wordbank') return { ...base, kind: 'build' };
  if (type === 'blanks30') return { ...base, kind: 'blanks', ratio: 0.3 };
  return { ...base, kind: 'blanks', ratio: 0.6 }; // blanks60; first-letter and type-cold arrive later
}

export function planSteps(session, verseById) {
  const fresh = [];
  const reviews = [];
  for (const { card, isNew } of session.items) {
    if (!verseById.get(card.verseId)) continue;
    if (isNew && card.skill === 'ref2text') fresh.push(card);
    else reviews.push(reviewStep(card, isNew, session.kind));
  }
  if (session.kind === 'comeback') {
    for (const r of reviews) if (r.kind === 'build' || r.kind === 'blanks') Object.assign(r, { kind: 'blanks', ratio: 0.6 });
  }

  const blocks = fresh.map((card) => {
    const v = verseById.get(card.verseId);
    const steps = [{ kind: 'meet', verseId: v.id, graded: false }];
    if (phrasesOf(v).length > 1) steps.push({ kind: 'phrases', verseId: v.id, graded: false });
    steps.push({ kind: 'build', verseId: v.id, cardId: card.id, newCard: card, graded: true });
    steps.push({ kind: 'where', verseId: v.id, graded: false });
    return steps;
  });

  // Reviews warm up first, new verses are spread between them, and each new
  // verse gets one more go at the end.
  const out = [];
  const slices = blocks.length + 1;
  const per = Math.ceil(reviews.length / slices);
  let r = 0;
  for (let b = 0; b <= blocks.length; b++) {
    out.push(...reviews.slice(r, r + per));
    r += per;
    if (b < blocks.length) out.push(...blocks[b]);
  }
  for (const card of fresh) out.push({ kind: 'blanks', ratio: 0.3, verseId: card.verseId, graded: false, closing: true });
  return out.map((s, i) => ({ id: i, ...s }));
}

// After a miss or "I don't know it yet": one practice repeat at the end, at
// most MAX_REPEATS a session, so the session still always ends.
export function withRepeat(steps, step) {
  const repeats = steps.filter((s) => s.repeatOf != null).length;
  if (repeats >= MAX_REPEATS || step.repeatOf != null) return steps;
  const kind = step.kind === 'blanks' ? 'build' : step.kind;
  return [...steps, { id: steps.length, kind, ratio: step.ratio, verseId: step.verseId, graded: false, repeatOf: step.id }];
}
