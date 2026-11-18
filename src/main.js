// App entry: load data, open storage, mount views.

import * as store from './store.js';
import {
  makeContext, assembleSession, assembleExtraPractice, isHeld, dayKey, DAY,
} from './scheduler.js';
import { renderToday } from './ui/today.js';
import { runSession, renderSessionDone } from './ui/session.js';

// Phase 1 drills the words only. Reference skills arrive with their
// exercise type in phase 2.
const PHASE_SKILLS = ['ref2text'];

// Time travel for checking the schedule by hand: ?offset=3d (or 12h).
const CLOCK_OFFSET = (() => {
  const m = new URLSearchParams(location.search).get('offset')?.match(/^(-?\d+(?:\.\d+)?)([dh])$/);
  return m ? Number(m[1]) * (m[2] === 'd' ? DAY : DAY / 24) : 0;
})();
const now = () => Date.now() + CLOCK_OFFSET;

const root = document.getElementById('app');

function dayKeyToMs(key) {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

async function loadContext(library) {
  const [cards, meta, path] = await Promise.all([store.getCards(), store.getMeta(), store.getSetting('path', 'starter')]);
  return makeContext({ library, cards, meta, settings: { path, skills: PHASE_SKILLS } });
}

async function showToday(app) {
  const ctx = await loadContext(app.library);
  const t = now();
  const lastSessionAt = dayKeyToMs(await store.getSetting('lastSessionDate'));
  const sessions = await store.getSessions();
  const seed = `${dayKey(t)}#${sessions.length}`;
  const preview = assembleSession(ctx, t, { lastSessionAt, seed });
  const active = await store.getSetting('activeSession', null);
  const canResume = !!active && active.date === dayKey(t) && active.index < active.items.length;
  const ref2text = ctx.cards.filter((c) => c.skill === 'ref2text');

  renderToday(root, {
    held: ref2text.filter(isHeld).length,
    learning: ref2text.filter((c) => !isHeld(c)).length,
    preview,
    canResume,
    extraAvailable: assembleExtraPractice(ctx, t).items.length > 0,
    degraded: store.isDegraded(),
    clockNote: CLOCK_OFFSET ? `Simulated time: ${new Date(t).toLocaleString()}` : '',
    path: ctx.settings.path,
    onStart: () => begin(app, preview, t),
    onResume: () => play(app, active),
    onExtra: () => begin(app, assembleExtraPractice(ctx, t, { seed }), t),
    onPath: async (value) => { await store.setSetting('path', value); showToday(app); },
  });
}

async function begin(app, session, t) {
  const active = {
    date: dayKey(t),
    kind: session.kind,
    startedAt: t,
    index: 0,
    correct: 0,
    items: session.items.map(({ card, isNew }) => ({ cardId: card.id, newCard: isNew ? card : null })),
  };
  await store.setSetting('activeSession', active);
  play(app, active);
}

function play(app, active) {
  runSession(root, {
    library: app.library,
    verseById: app.verseById,
    active,
    now,
    onSave: (next) => store.setSetting('activeSession', next),
    onExit: () => showToday(app),
    onDone: (done) => finish(app, done),
  });
}

async function finish(app, done) {
  const t = now();
  await store.addSession({
    date: dayKey(t), items: done.items.length, correct: done.correct,
    durationMs: t - done.startedAt, xp: done.correct * 10, kind: done.kind,
  });
  if (done.kind !== 'extra') await store.setSetting('lastSessionDate', dayKey(t));
  await store.setSetting('activeSession', null);
  renderSessionDone(root, { active: done, onHome: () => showToday(app) });
}

async function start() {
  try {
    const res = await fetch('./data/library.json');
    if (!res.ok) throw new Error(`library.json: HTTP ${res.status}`);
    const library = await res.json();
    await store.open();
    const app = { library, verseById: new Map(library.verses.map((v) => [v.id, v])) };
    await showToday(app);
  } catch (err) {
    console.error(err);
    root.textContent = `The app could not start: ${err.message}`;
  }
}

start();
