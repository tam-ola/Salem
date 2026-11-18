// Time-travel harness: replays days of sessions against the real scheduler
// with a simulated learner, and records load and invariant violations.

import * as S from '../src/scheduler.js';

// Simulated recall. New and learning cards: a flat chance. Review cards: a
// forgetting curve calibrated so recall is `reviewP` when answered exactly on
// schedule and decays the longer a card sits overdue.
function recallChance(card, now, { learningP, reviewP }) {
  if (card.state !== 'review') return learningP;
  const elapsed = Math.max(0, (now - (card.lastSeen ?? now)) / S.DAY);
  return reviewP ** (elapsed / Math.max(card.interval, 1));
}

export function simulate(library, opts = {}) {
  const {
    days = 90,
    sessionHours = [7],
    skipDays = [],
    learningP = 0.85,
    reviewP = 0.9,
    skills = S.SKILLS,
    seed = 'sim',
    start = [2026, 0, 5], // y, m, d (local)
  } = opts;
  const rand = S.seededRandom(seed);
  const skip = new Set(skipDays);
  const cards = new Map();
  const verseById = new Map(library.verses.map((v) => [v.id, v]));
  const violations = [];
  const log = [];
  let lastSessionAt = null;
  let prevCount = 0;
  const fail = (day, msg) => violations.push(`day ${day}: ${msg}`);
  const dayStartOf = (d) => new Date(start[0], start[1], start[2] + d).getTime(); // DST-safe

  for (let day = 0; day < days; day++) {
    const dayStart = dayStartOf(day);
    const firstAt = dayStart + sessionHours[0] * 3600e3;
    const ctx0 = S.makeContext({ library, cards: [...cards.values()], settings: { skills } });
    const row = {
      day,
      away: skip.has(day),
      dueAtStart: S.dueCards(ctx0, firstAt).length,
      items: 0,
      correct: 0,
      newVerses: 0,
      newSkills: 0,
      kinds: [],
    };

    if (!row.away) {
      for (const h of sessionHours) {
        const at = dayStart + h * 3600e3;
        const ctx = S.makeContext({ library, cards: [...cards.values()], settings: { skills } });
        const dueNow = S.dueCards(ctx, at).length;
        const session = S.assembleSession(ctx, at, { lastSessionAt, seed: `${seed}:${day}:${h}` });
        row.kinds.push(session.kind);

        // Session invariants.
        if (session.items.length > S.SESSION_SIZE) fail(day, `session of ${session.items.length} items`);
        const ids = session.items.map((i) => i.card.id);
        if (new Set(ids).size !== ids.length) fail(day, 'a card appears twice in one session');
        const fresh = session.items.filter((i) => i.isNew);
        if (dueNow > S.BACKLOG_GATE && fresh.length) fail(day, `new material with ${dueNow} due`);
        for (const { card, isNew } of session.items) {
          const v = verseById.get(card.verseId);
          if (!v) fail(day, `card for unknown verse ${card.verseId}`);
          else if (v.track === 'reflection') fail(day, `reflection item ${v.id} in session`);
          if (isNew && cards.has(card.id)) fail(day, `re-introduced existing card ${card.id}`);
          if (!isNew && !cards.has(card.id)) fail(day, `session card ${card.id} not in store`);
          if (!skills.includes(card.skill)) fail(day, `disabled skill ${card.skill}`);
        }

        session.items.forEach(({ card, isNew }, k) => {
          const t = at + k * 20e3;
          const correct = rand() < recallChance(card, t, { learningP, reviewP });
          const durationMs = 4000 + rand() * 12000;
          const updated = S.answerCard(card, { correct, durationMs, span: verseById.get(card.verseId).verse_span }, t);
          cards.set(updated.id, updated);
          row.items++;
          if (correct) row.correct++;
          if (isNew && card.skill === 'ref2text') row.newVerses++;
          else if (isNew) row.newSkills++;
        });
        for (const r of S.retirements([...cards.values()])) cards.set(r.id, r);
        if (session.items.length) lastSessionAt = at;
      }
    }

    // Store invariants at end of day.
    const all = [...cards.values()];
    if (cards.size < prevCount) fail(day, `card count fell from ${prevCount} to ${cards.size}`);
    prevCount = cards.size;
    if (row.newVerses > S.DAILY_NEW_CAP) fail(day, `${row.newVerses} new verses in one day`);
    const endOfDay = dayStartOf(day + 1);
    const maxGap = (S.MAX_INTERVAL * (1 + S.JITTER) + 1) * S.DAY;
    for (const c of all) {
      if (c.id !== S.cardId(c.verseId, c.skill)) fail(day, `card id mismatch ${c.id}`);
      if (!Number.isFinite(c.due)) fail(day, `card ${c.id} has no due date`);
      if (c.lastSeen != null && c.due - c.lastSeen > maxGap) fail(day, `card ${c.id} scheduled beyond the cap`);
      if (c.lastSeen != null && c.due < c.lastSeen) fail(day, `card ${c.id} due before it was seen`);
      if (!['new', 'learning', 'review'].includes(c.state)) fail(day, `card ${c.id} state ${c.state}`);
    }
    const ctxEnd = S.makeContext({ library, cards: all, settings: { skills } });
    const live = all.filter((c) => !c.retired && skills.includes(c.skill));
    const oldestOverdue = live.reduce((m, c) => Math.max(m, (endOfDay - c.due) / S.DAY), 0);
    const ref2text = all.filter((c) => c.skill === 'ref2text');
    log.push({
      ...row,
      dueAtEnd: S.dueCards(ctxEnd, endOfDay - 1).length,
      oldestOverdueDays: Math.round(oldestOverdue * 10) / 10,
      verses: ref2text.length,
      held: ref2text.filter(S.isHeld).length,
      cards: all.length,
      retired: all.filter((c) => c.retired).length,
    });
  }
  return { log, violations, cards: [...cards.values()] };
}

export function summarize(log, every = 7) {
  const rows = [];
  for (let d = 0; d < log.length; d += every) {
    const w = log.slice(d, d + every);
    rows.push({
      days: `${d + 1}–${d + w.length}`,
      maxDue: Math.max(...w.map((r) => r.dueAtStart)),
      avgItems: Math.round((w.reduce((s, r) => s + r.items, 0) / w.length) * 10) / 10,
      newVerses: w.reduce((s, r) => s + r.newVerses, 0),
      verses: w.at(-1).verses,
      held: w.at(-1).held,
      oldestOverdue: Math.max(...w.map((r) => r.oldestOverdueDays)),
    });
  }
  return rows;
}
