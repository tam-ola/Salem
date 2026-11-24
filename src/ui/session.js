// A session: a list of steps, one at a time. The main button sits in the same
// place for every step. Each answer is saved as it is given, so leaving
// mid-session loses nothing. See SPEC.md §4.5, §11.

import { el } from './text.js';
import * as icons from './icons.js';
import * as store from '../store.js';
import { answerCard, retirements } from '../scheduler.js';
import { withRepeat } from '../sessionplan.js';
import { stageOf, STAGES } from '../progress.js';
import * as meet from '../exercises/meet.js';
import * as phrases from '../exercises/phrases.js';
import * as wordbank from '../exercises/wordbank.js';
import * as blanks from '../exercises/blanks.js';
import * as refchoice from '../exercises/refchoice.js';

const POINTS = { first: 10, practice: 5, hint: 2 };

function mountStep(step, body, opts) {
  if (step.kind === 'meet') return meet.mount(body, opts);
  if (step.kind === 'phrases') return phrases.mount(body, opts);
  if (step.kind === 'build') return wordbank.mount(body, opts);
  if (step.kind === 'blanks') return blanks.mount(body, { ...opts, ratio: step.ratio ?? 0.3 });
  return refchoice.mount(body, { ...opts, mode: step.kind });
}

const hasHelpers = (kind) => kind === 'build' || kind === 'blanks';

export async function runSession(root, ctx) {
  const { library, verseById, now, onSave, onExit, onDone, streakDays } = ctx;
  let active = ctx.active;
  const step = active.steps[active.index];
  if (!step) return onDone(active);

  const verse = verseById.get(step.verseId);
  const card = step.graded ? step.newCard ?? (await store.get('cards', step.cardId)) : null;
  if (!verse || (step.graded && !card)) {
    active = { ...active, index: active.index + 1 };
    await onSave(active);
    return runSession(root, { ...ctx, active });
  }

  const done = active.index;
  const total = active.steps.length;
  const bar = el('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Session progress', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) },
    el('i', { style: `width:${Math.round((done / total) * 100)}%` }));
  const leave = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Leave session (progress is kept)', onclick: onExit }, icons.close());
  const topbar = el('header', { class: 'topbar' }, leave, bar, streakDays ? el('span', { class: 'mini', title: 'Days watered' }, icons.drop(14), String(streakDays)) : null);

  const body = el('section', { class: 'exercise', 'aria-live': 'polite' });
  const sheet = el('div', { class: 'sheet', role: 'status' });
  const hintBtn = el('button', { class: 'ghost', type: 'button' }, icons.bulb(), 'Hint ', el('span', { class: 'cost' }, `next word, −${POINTS.hint}`));
  const idkBtn = el('button', { class: 'ghost plain', type: 'button' }, 'I don’t know it yet');
  const helpers = el('div', { class: 'helpers' }, hintBtn, idkBtn);
  const primary = el('button', { class: 'btn', type: 'button', disabled: true }, 'Check');
  root.replaceChildren(el('div', { class: 'screen session' }, topbar, el('main', { class: 'scroll' }, body), sheet, el('footer', { class: 'actions' }, helpers, primary)));

  let mode = 'check'; // 'check' | 'continue' | 'meet'
  let finished = null;
  const startedAt = performance.now();
  const ex = mountStep(step, body, {
    verse, library, seed: `${verse.id}:${card?.reps ?? 0}:${step.id}`,
    onReady: (ready) => { if (mode === 'check') primary.disabled = !ready; },
  });

  helpers.classList.toggle('hidden', !hasHelpers(step.kind));
  if (step.kind === 'meet') { mode = 'meet'; primary.disabled = false; primary.textContent = ex.label(); }

  function showSheet({ kind, title, body: content }) {
    sheet.className = `sheet ${kind}`;
    root.firstChild.classList.add('sheet-open');
    sheet.replaceChildren(el('h3', {}, title), typeof content === 'string' ? el('p', {}, content) : content);
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('show')));
    if (kind === 'ok') { try { navigator.vibrate?.(12); } catch { /* not supported */ } }
  }
  function hideSheet() { sheet.className = 'sheet'; sheet.replaceChildren(); root.firstChild.classList.remove('sheet-open'); }

  async function settle(result, gaveUp = false) {
    showSheet(result.sheet);
    mode = 'continue';
    helpers.classList.add('hidden');
    primary.textContent = 'Continue';
    primary.disabled = true; // until the answer is saved
    if (result.final) finished = await record(result.correct, gaveUp);
    primary.disabled = false;
    primary.focus({ preventScroll: true });
  }

  hintBtn.onclick = () => { ex.hint?.(); };
  idkBtn.onclick = () => { if (mode === 'check' && ex.giveUp) settle(ex.giveUp(), true); };

  primary.onclick = async () => {
    if (mode === 'meet') {
      if (!ex.press()) { primary.textContent = ex.label(); return; }
      finished = await record(true, false);
      return runSession(root, { ...ctx, active: finished });
    }
    if (mode === 'check') return settle(ex.check());
    if (!finished && ex.next()) {
      hideSheet();
      mode = 'check';
      primary.textContent = 'Check';
      primary.disabled = true;
      helpers.classList.toggle('hidden', !hasHelpers(step.kind));
      return;
    }
    runSession(root, { ...ctx, active: finished });
  };

  async function record(correct, gaveUp) {
    const hints = ex.hints ?? 0;
    // Help with more than half the words is not recall yet.
    const recalled = correct && !gaveUp && hints * 2 <= (ex.wordCount ?? Infinity);
    let next = { ...active, index: active.index + 1 };
    if (step.kind !== 'meet') {
      const base = step.graded && step.repeatOf == null ? POINTS.first : POINTS.practice;
      next.xp += recalled ? Math.max(0, base - hints * POINTS.hint) : 0;
    }
    if (step.graded) {
      const updated = answerCard(card, {
        correct: recalled,
        durationMs: hints ? Infinity : performance.now() - startedAt,
        span: verse.verse_span,
      }, now());
      await store.putCards([updated]);
      const retire = retirements(await store.getCards());
      if (retire.length) await store.putCards(retire);
      next.graded += 1;
      next.gradedCorrect += recalled ? 1 : 0;
    }
    if (!recalled && step.kind !== 'meet' && step.kind !== 'phrases') next.steps = withRepeat(next.steps, step);
    active = next;
    await onSave(next);
    return next;
  }
}

export async function renderSessionDone(root, { active, onHome }) {
  const cards = await store.getCards();
  const byVerse = new Map(cards.filter((c) => c.skill === 'ref2text').map((c) => [c.verseId, c]));
  const grew = [...new Set(active.steps.map((s) => s.verseId))]
    .map((id) => ({ id, before: active.stagesBefore?.[id] ?? -1, after: stageOf(byVerse.get(id)), card: byVerse.get(id) }))
    .filter((g) => g.card && g.after > g.before)
    .slice(0, 4);
  const minutes = Math.max(1, Math.round((Date.now() - active.realStartedAt) / 60000));
  const burst = el('div', { class: 'burst', 'aria-hidden': 'true' });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const d = 120 + (i % 3) * 36;
    burst.append(el('i', { style: `--x:${Math.round(Math.cos(a) * d)}px;--y:${Math.round(Math.sin(a) * d)}px;animation-delay:${(i % 4) * 0.07}s` }));
  }
  const title = active.kind === 'comeback' ? 'Check-in complete' : 'Session complete';
  const lead = active.kind === 'extra'
    ? 'Practice only. Your schedule is unchanged.'
    : grew.length ? `${verseRef(active, grew[0].id)} has ${grew[0].after >= 2 ? 'grown' : 'put down roots'}.` : 'Your garden is watered for today.';
  const main = el('main', { class: 'scroll done' }, burst,
    icons.plant(grew.length ? Math.max(1, grew[0].after) : 2, 120),
    el('h1', { class: 'display' }, title),
    el('p', { class: 'muted' }, lead),
    el('div', { class: 'stats' },
      stat(active.graded ? `${active.gradedCorrect}/${active.graded}` : '—', 'first try'),
      stat(`+${active.xp}`, 'points'),
      stat(`${minutes} min`, 'time')),
    grew.length ? el('div', { class: 'grew' }, ...grew.map((g) => el('div', {}, icons.plant(g.after, 30), el('b', { class: 'serif' }, verseRef(active, g.id)), el('span', { class: 'muted' }, STAGES[g.after])))) : null);
  root.replaceChildren(el('div', { class: 'screen' }, main, el('footer', { class: 'actions' }, el('div', { class: 'helpers hidden' }), el('button', { class: 'btn', type: 'button', onclick: onHome }, 'Done'))));
}

const verseRef = (active, id) => active.refs?.[id] ?? id;
const stat = (value, label) => el('div', {}, el('b', {}, value), el('span', {}, label));

