// Interval scheduling and session assembly. Pure functions: every function
// that depends on time takes `now` (ms since epoch) as an argument, so the
// whole schedule can be replayed in simulated time. See SPEC.md §4.

export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

export const LEARNING_STEPS = [10 * MINUTE, DAY];
export const REVIEW_LADDER = [1, 3, 7, 16, 35, 75, 160, 350]; // days
export const EASE_START = 2.3;
export const EASE_MIN = 1.3;
export const EASE_MAX = 2.8;
export const EASE_STEP_QUICK = 0.05;
export const EASE_STEP_LAPSE = 0.2;
export const MAX_INTERVAL = 400; // days
export const JITTER = 0.06;
export const QUICK_MS_PER_VERSE = 8000;
export const HELD_INTERVAL = 21; // days

export const SESSION_SIZE = 12;
export const MAX_OVERDUE = 8;
export const DAILY_NEW_CAP = 2;
export const BACKLOG_GATE = 25;
export const EXTRA_PRACTICE_BELOW = 4;
export const EXTRA_PRACTICE_SIZE = 6;
export const COMEBACK_GAP_DAYS = 7;
export const COMEBACK_MIN_OVERDUE = 10;
export const COMEBACK_SIZE = 8;

export const SKILLS = ['ref2text', 'text2ref', 'book'];
const DRILL_TRACKS = new Set(['verse', 'passage']); // `reflection` is excluded

export const cardId = (verseId, skill) => `${verseId}:${skill}`;

// ---------------------------------------------------------------- utilities

// FNV-1a string hash -> [0, 1). Deterministic seeds for jitter and shuffles.
export function hash01(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

// mulberry32: small seeded PRNG.
export function seededRandom(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : Math.floor(hash01(String(seed)) * 4294967296);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, rand) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function startOfDay(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKey(now) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ---------------------------------------------------------------- cards

export function createCard(verseId, skill, now) {
  return {
    id: cardId(verseId, skill),
    verseId,
    skill,
    state: 'new',
    step: 0, // index into LEARNING_STEPS while learning
    ladderPos: 0, // index into REVIEW_LADDER; kept through a lapse
    interval: 0, // days
    ease: EASE_START,
    due: now,
    reps: 0,
    lapses: 0,
    lastResult: null,
    lastSeen: null,
    introducedAt: now,
    recent: [], // results of the last reviews in review state, newest last
    retired: false, // `book` cards retire once `text2ref` reaches review
  };
}

function reviewInterval(pos, ease) {
  return Math.min((REVIEW_LADDER[pos] * ease) / EASE_START, MAX_INTERVAL);
}

function withDue(card, intervalDays, now) {
  // ±6% jitter, seeded by card and rep so a replay is identical.
  const jitter = (hash01(`${card.id}#${card.reps}`) * 2 - 1) * JITTER;
  return { ...card, interval: intervalDays, due: now + intervalDays * DAY * (1 + jitter) };
}

// Apply one answer. Returns a new card; the input is not modified.
// `durationMs` and `span` (verses in the item) decide whether it was quick.
export function answerCard(card, { correct, durationMs = Infinity, span = 1 }, now) {
  const prevSeen = card.lastSeen;
  const c = {
    ...card,
    reps: card.reps + 1,
    lastResult: correct ? 'correct' : 'wrong',
    lastSeen: now,
    recent: card.recent.slice(),
  };

  if (card.state === 'new') {
    // First exposure: enter learning at the first step either way.
    return withDue({ ...c, state: 'learning', step: 0 }, LEARNING_STEPS[0] / DAY, now);
  }

  if (card.state === 'learning') {
    if (!correct) return withDue(c, LEARNING_STEPS[c.step] / DAY, now);
    const step = c.step + 1;
    if (step < LEARNING_STEPS.length) {
      return withDue({ ...c, step }, LEARNING_STEPS[step] / DAY, now);
    }
    // Graduate. A new card starts at ladder position 0; a lapsed card resumes
    // at the position it dropped to.
    return withDue({ ...c, state: 'review', step: 0 }, reviewInterval(c.ladderPos, c.ease), now);
  }

  // review
  if (!correct) {
    c.recent = [...c.recent, false].slice(-2);
    return withDue(
      {
        ...c,
        state: 'learning',
        step: LEARNING_STEPS.length - 1,
        lapses: c.lapses + 1,
        ease: clamp(c.ease - EASE_STEP_LAPSE, EASE_MIN, EASE_MAX),
        ladderPos: Math.max(0, c.ladderPos - 2),
      },
      LEARNING_STEPS[LEARNING_STEPS.length - 1] / DAY,
      now,
    );
  }

  const quick = durationMs < QUICK_MS_PER_VERSE * Math.max(1, span);
  const ease = clamp(c.ease + (quick ? EASE_STEP_QUICK : 0), EASE_MIN, EASE_MAX);
  // Advance one rung; if the card was recalled after a longer gap than that
  // rung, jump to the rung that covers the gap (the comeback rule, §4.6).
  const elapsed = prevSeen == null ? 0 : (now - prevSeen) / DAY;
  const last = REVIEW_LADDER.length - 1;
  let pos = Math.min(c.ladderPos + 1, last);
  while (pos < last && reviewInterval(pos, ease) < elapsed) pos++;
  c.recent = [...c.recent, true].slice(-2);
  return withDue({ ...c, ease, ladderPos: pos }, reviewInterval(pos, ease), now);
}

// §4.3: interval >= 21 days and no lapse in the last two reviews.
export function isHeld(card) {
  return (
    card.skill === 'ref2text' &&
    !card.retired &&
    card.state === 'review' &&
    card.interval >= HELD_INTERVAL &&
    card.recent.length > 0 &&
    card.recent.slice(-2).every(Boolean)
  );
}

// A day-scale card is due any time on its due day; a minute-scale learning
// step is due only once it has actually elapsed.
export function isDue(card, now) {
  if (card.state === 'new' || card.retired) return false;
  if (card.interval >= 1) return card.due < startOfDay(now) + DAY;
  return card.due <= now;
}

// ---------------------------------------------------------------- eligibility

export function makeContext({ library, cards, meta = [], settings = {} }) {
  const verseById = new Map(library.verses.map((v) => [v.id, v]));
  const metaById = new Map(meta.map((m) => [m.verseId, m]));
  const cardById = new Map(cards.map((c) => [c.id, c]));
  return {
    library,
    verseById,
    metaById,
    cardById,
    cards,
    settings: {
      path: 'starter',
      skills: SKILLS,
      dailyNewCap: DAILY_NEW_CAP,
      preferPersonal: true,
      activeThemes: [],
      ...settings,
    },
  };
}

function verseIsDrillable(ctx, verseId) {
  const v = ctx.verseById.get(verseId);
  if (!v || !DRILL_TRACKS.has(v.track)) return false; // explicit reflection exclusion
  return !ctx.metaById.get(verseId)?.archived;
}

function cardIsEligible(ctx, card) {
  return !card.retired && ctx.settings.skills.includes(card.skill) && verseIsDrillable(ctx, card.verseId);
}

const isToday = (t, now) => t != null && t >= startOfDay(now) && t < startOfDay(now) + DAY;

// ---------------------------------------------------------------- new material

// Next verses to introduce, in unlock order (§4.4).
export function nextNewVerses(ctx, count) {
  if (count <= 0) return [];
  const { library, settings, cardById } = ctx;
  const path = settings.path === 'classic' ? library.classic_path : library.starter_path;
  const onPath = new Set(path);
  const themes = new Set(settings.activeThemes);
  const themeOk = (v) => {
    if (!themes.size) return true;
    const tags = ctx.metaById.get(v.id)?.themesOverride ?? v.themes;
    return tags.some((t) => themes.has(t));
  };
  const rest = library.verses.filter((v) => !onPath.has(v.id) && themeOk(v));
  if (settings.preferPersonal) {
    rest.sort((a, b) => (a.collection === 'personal' ? 0 : 1) - (b.collection === 'personal' ? 0 : 1));
  } // Array.prototype.sort is stable, so canonical order holds within each group.

  const out = [];
  for (const v of [...path.map((id) => ctx.verseById.get(id)), ...rest]) {
    if (out.length >= count) break;
    if (!v || cardById.has(cardId(v.id, 'ref2text'))) continue;
    if (!verseIsDrillable(ctx, v.id)) continue;
    out.push(v);
  }
  return out;
}

// Reference skills are staged: `book` once ref2text reaches review, then
// `text2ref` once book reaches review; book retires when text2ref does.
export function pendingSkillCards(ctx) {
  const { cardById, settings } = ctx;
  const out = [];
  for (const c of ctx.cards) {
    if (c.skill !== 'ref2text' || c.state !== 'review' || !verseIsDrillable(ctx, c.verseId)) continue;
    const book = cardById.get(cardId(c.verseId, 'book'));
    const t2r = cardById.get(cardId(c.verseId, 'text2ref'));
    if (!book && !t2r && settings.skills.includes('book')) out.push({ verseId: c.verseId, skill: 'book' });
    else if (book?.state === 'review' && !t2r && settings.skills.includes('text2ref')) {
      out.push({ verseId: c.verseId, skill: 'text2ref' });
    }
  }
  return out;
}

// Cards to write back when text2ref reaches review: the book card retires.
export function retirements(cards) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out = [];
  for (const c of cards) {
    if (c.skill !== 'text2ref' || c.state !== 'review') continue;
    const book = byId.get(cardId(c.verseId, 'book'));
    if (book && !book.retired) out.push({ ...book, retired: true });
  }
  return out;
}

// ---------------------------------------------------------------- sessions

// Counts used internally for gating. Never shown to the user (§4.6).
export function dueCards(ctx, now) {
  return ctx.cards.filter((c) => cardIsEligible(ctx, c) && isDue(c, now));
}

export function isComeback(ctx, now, lastSessionAt) {
  if (lastSessionAt == null) return false;
  if (now - lastSessionAt < COMEBACK_GAP_DAYS * DAY) return false;
  const today = startOfDay(now);
  const overdue = ctx.cards.filter((c) => cardIsEligible(ctx, c) && c.state !== 'new' && c.due < today);
  return overdue.length >= COMEBACK_MIN_OVERDUE;
}

// Build one session. Returns { kind, items } where each item is
// { card, isNew } — `card` is the current card, or a freshly created one for
// new material (persist it only once answered).
export function assembleSession(ctx, now, { lastSessionAt = null, seed = dayKey(now) } = {}) {
  const today = startOfDay(now);
  const rand = seededRandom(`session:${seed}`);
  const due = dueCards(ctx, now);
  const byDue = (a, b) => a.due - b.due;

  if (isComeback(ctx, now, lastSessionAt)) {
    const items = due
      .filter((c) => c.due < today)
      .sort(byDue)
      .slice(0, COMEBACK_SIZE)
      .map((card) => ({ card, isNew: false }));
    return { kind: 'comeback', items };
  }

  const picked = [];
  const seen = new Set();
  const take = (cards, limit = Infinity) => {
    let n = 0;
    for (const card of cards) {
      if (picked.length >= SESSION_SIZE || n >= limit) break;
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      picked.push({ card, isNew: false });
      n++;
    }
  };

  // 1. Overdue reviews, most overdue first, at most 8.
  take(due.filter((c) => c.state === 'review' && c.due < today).sort(byDue), MAX_OVERDUE);
  // 2. Reviews due today.
  take(due.filter((c) => c.state === 'review' && c.due >= today).sort(byDue));
  // 3. Learning steps that have elapsed.
  take(due.filter((c) => c.state === 'learning').sort(byDue));

  // 4. New material, only when the backlog is small.
  if (due.length <= BACKLOG_GATE) {
    const introducedToday = (skillFilter) =>
      ctx.cards.filter((c) => skillFilter(c.skill) && isToday(c.introducedAt, now)).length;
    const room = () => SESSION_SIZE - picked.length;

    const verseRoom = Math.min(ctx.settings.dailyNewCap - introducedToday((s) => s === 'ref2text'), room());
    for (const v of nextNewVerses(ctx, verseRoom)) {
      picked.push({ card: createCard(v.id, 'ref2text', now), isNew: true });
    }
    const skillRoom = Math.min(ctx.settings.dailyNewCap - introducedToday((s) => s !== 'ref2text'), room());
    for (const p of pendingSkillCards(ctx).slice(0, Math.max(0, skillRoom))) {
      picked.push({ card: createCard(p.verseId, p.skill, now), isNew: true });
    }
  }

  return { kind: 'daily', items: shuffle(picked, rand) };
}

// Optional practice from held verses when a session is short (§4.5).
// Practice answers do not reschedule.
export function assembleExtraPractice(ctx, now, { seed = dayKey(now) } = {}) {
  const held = ctx.cards
    .filter((c) => cardIsEligible(ctx, c) && isHeld(c) && !isDue(c, now))
    .sort((a, b) => (a.lastSeen ?? 0) - (b.lastSeen ?? 0))
    .slice(0, EXTRA_PRACTICE_SIZE);
  return { kind: 'extra', items: shuffle(held, seededRandom(`extra:${seed}`)).map((card) => ({ card, isNew: false })) };
}

// Exercise type from state and interval (§5). The UI maps types it does not
// yet implement to the nearest available one.
export function exerciseFor(card, { focusGraduation = false } = {}) {
  if (card.skill !== 'ref2text') return 'refchoice';
  if (focusGraduation) return 'typecold';
  if (card.state === 'new' || card.state === 'learning') return 'wordbank';
  if (card.interval < 7) return 'blanks30';
  if (card.interval < HELD_INTERVAL) return 'blanks60';
  return 'firstletter';
}
