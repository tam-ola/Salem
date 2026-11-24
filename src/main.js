// App entry: load data, open storage, route between screens.

import * as store from './store.js';
import { makeContext, assembleSession, assembleExtraPractice, isHeld, dayKey, DAY, SKILLS } from './scheduler.js';
import { planSteps } from './sessionplan.js';
import { streak, stageOf } from './progress.js';
import { renderIntro } from './ui/intro.js';
import { renderToday } from './ui/today.js';
import { renderSettings } from './ui/settings.js';
import { runSession, renderSessionDone } from './ui/session.js';

const SESSION_FORMAT = 2;

// Time travel for checking the schedule by hand: ?offset=3d (or 12h).
const CLOCK_OFFSET = (() => {
  const m = new URLSearchParams(location.search).get('offset')?.match(/^(-?\d+(?:\.\d+)?)([dh])$/);
  return m ? Number(m[1]) * (m[2] === 'd' ? DAY : DAY / 24) : 0;
})();
const now = () => Date.now() + CLOCK_OFFSET;

const root = document.getElementById('app');

const DEFAULTS = { path: 'starter', theme: 'system', textScale: 1, introDone: false };

async function readSettings() {
  const out = {};
  for (const [k, v] of Object.entries(DEFAULTS)) out[k] = await store.getSetting(k, v);
  return out;
}

function applyAppearance({ theme, textScale }) {
  const html = document.documentElement;
  if (theme === 'light' || theme === 'dark') html.dataset.theme = theme;
  else delete html.dataset.theme;
  html.style.setProperty('--text-scale', String(Number(textScale) || 1));
}

function dayKeyToMs(key) {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

// "Psalm 34:8" -> "Psa 34:8", "1 Kings 8:22-53" -> "1 Kin 8:22-53"
const shortRef = (ref) => ref.replace(/^((?:\d )?)([A-Za-z]+)(?: of [A-Za-z]+)?(?= \d)/, (_, n, name) => `${n}${name.slice(0, 3)}`);

async function loadState(app) {
  const [cards, meta, settings, sessions] = await Promise.all([store.getCards(), store.getMeta(), readSettings(), store.getSessions()]);
  const ctx = makeContext({ library: app.library, cards, meta, settings: { path: settings.path, skills: SKILLS } });
  return { cards, ctx, settings, sessions };
}

function planFor(app, session) {
  const steps = planSteps(session, app.verseById);
  return {
    kind: session.kind,
    steps,
    newRefs: steps.filter((s) => s.kind === 'meet').map((s) => app.verseById.get(s.verseId).reference),
    practice: new Set(steps.filter((s) => s.graded && !s.newCard).map((s) => s.verseId)).size,
  };
}

async function showToday(app) {
  const { cards, ctx, settings, sessions } = await loadState(app);
  applyAppearance(settings);
  if (!settings.introDone) return showIntro(app, settings);

  const t = now();
  const lastSessionAt = dayKeyToMs(await store.getSetting('lastSessionDate'));
  const seed = `${dayKey(t)}#${sessions.length}`;
  const plan = planFor(app, assembleSession(ctx, t, { lastSessionAt, seed }));
  const active = await store.getSetting('activeSession', null);
  const canResume = !!active && active.format === SESSION_FORMAT && active.date === dayKey(t) && active.index < active.steps.length;
  const ref2text = cards.filter((c) => c.skill === 'ref2text' && app.verseById.has(c.verseId));
  const plants = ref2text
    .sort((a, b) => (b.introducedAt ?? 0) - (a.introducedAt ?? 0))
    .map((c) => { const ref = app.verseById.get(c.verseId).reference; return { ref, short: shortRef(ref), stage: stageOf(c) }; });
  const st = streak(sessions.filter((s) => s.kind !== 'extra').map((s) => s.date), t);

  renderToday(root, {
    now: t,
    held: ref2text.filter(isHeld).length,
    plants,
    streak: st,
    plan,
    canResume,
    extraAvailable: assembleExtraPractice(ctx, t).items.length > 0,
    degraded: store.isDegraded(),
    clockNote: CLOCK_OFFSET ? `Simulated time: ${new Date(t).toLocaleString()}` : '',
    onStart: () => begin(app, plan, cards, t),
    onResume: () => play(app, active, st.days),
    onExtra: () => begin(app, planFor(app, assembleExtraPractice(ctx, t, { seed })), cards, t),
    onSettings: () => showSettings(app),
  });
}

function showIntro(app, settings) {
  const ref = (id) => app.verseById.get(id)?.reference ?? '';
  renderIntro(root, {
    path: settings.path,
    firsts: { starter: ref(app.library.starter_path[0]), classic: ref(app.library.classic_path[0]) },
    onSkip: async () => { await store.setSetting('introDone', true); showToday(app); },
    onFinish: async (path) => {
      await store.setSetting('path', path);
      await store.setSetting('introDone', true);
      const { cards, ctx } = await loadState(app);
      const t = now();
      begin(app, planFor(app, assembleSession(ctx, t, { seed: `${dayKey(t)}#intro` })), cards, t);
    },
  });
}

async function showSettings(app) {
  const settings = await readSettings();
  applyAppearance(settings);
  renderSettings(root, {
    settings,
    sample: app.verseById.get(app.library.starter_path[0])?.text,
    degraded: store.isDegraded(),
    onChange: async (name, value) => { await store.setSetting(name, value); showSettings(app); },
    onIntro: async () => { await store.setSetting('introDone', false); showToday(app); },
    onBack: () => showToday(app),
  });
}

async function begin(app, plan, cards, t) {
  if (!plan.steps.length) return showToday(app);
  const verseIds = new Set(plan.steps.map((s) => s.verseId));
  const stagesBefore = {};
  const refs = {};
  for (const c of cards) if (c.skill === 'ref2text' && verseIds.has(c.verseId)) stagesBefore[c.verseId] = stageOf(c);
  for (const id of verseIds) refs[id] = app.verseById.get(id).reference;
  const active = {
    format: SESSION_FORMAT, date: dayKey(t), kind: plan.kind, startedAt: t, realStartedAt: Date.now(),
    steps: plan.steps, index: 0, xp: 0, graded: 0, gradedCorrect: 0, stagesBefore, refs,
  };
  await store.setSetting('activeSession', active);
  const sessions = await store.getSessions();
  play(app, active, streak(sessions.filter((s) => s.kind !== 'extra').map((s) => s.date), t).days);
}

function play(app, active, streakDays) {
  runSession(root, {
    library: app.library,
    verseById: app.verseById,
    active,
    now,
    streakDays,
    onSave: (next) => store.setSetting('activeSession', next),
    onExit: () => showToday(app),
    onDone: (done) => finish(app, done),
  });
}

async function finish(app, done) {
  const t = now();
  await store.addSession({
    date: dayKey(t), items: done.graded, correct: done.gradedCorrect,
    durationMs: Date.now() - done.realStartedAt, xp: done.xp, kind: done.kind,
  });
  if (done.kind !== 'extra') await store.setSetting('lastSessionDate', dayKey(t));
  await store.setSetting('activeSession', null);
  renderSessionDone(root, { active: done, onHome: () => showToday(app) });
}

async function start() {
  try {
    const res = await fetch('./data/library.json');
    if (!res.ok) throw new Error(`could not load data/library.json (HTTP ${res.status}). Check that the data folder was uploaded next to index.html.`);
    const library = await res.json();
    await store.open();
    const app = { library, verseById: new Map(library.verses.map((v) => [v.id, v])) };
    await showToday(app);
  } catch (err) {
    console.error(err);
    root.replaceChildren();
    const p = document.createElement('p');
    p.className = 'fatal';
    p.textContent = `The app could not start: ${err.message}`;
    root.append(p);
  }
}

start();
