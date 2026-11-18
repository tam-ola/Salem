// A session: a fixed list of items, one at a time. The primary button sits in
// the same place for every item. Each answer is saved as soon as it is given,
// so leaving mid-session loses nothing.

import { el } from './text.js';
import * as store from '../store.js';
import { answerCard, exerciseFor, retirements } from '../scheduler.js';
import * as wordbank from '../exercises/wordbank.js';
import * as blanks from '../exercises/blanks.js';

// Phase 1 has two exercise types; later tiers fall back to blanks.
const EXERCISES = {
  wordbank: (c, o) => wordbank.mount(c, o),
  blanks30: (c, o) => blanks.mount(c, { ...o, ratio: 0.3 }),
};
const available = (type) => (EXERCISES[type] ? type : 'blanks30');

export async function runSession(root, { library, verseById, active, now, onSave, onExit, onDone }) {
  const item = active.items[active.index];
  if (!item) return onDone(active);

  const card = item.newCard ?? (await store.get('cards', item.cardId));
  const verse = verseById.get(card?.verseId);
  if (!card || !verse) {
    // A card or verse that has vanished (archived data, regenerated library).
    await onSave({ ...active, index: active.index + 1 });
    return runSession(root, { library, verseById, active: { ...active, index: active.index + 1 }, now, onSave, onExit, onDone });
  }

  const type = available(exerciseFor(card));
  const header = el('header', { class: 'session-header' },
    el('span', {}, `${active.index + 1} of ${active.items.length}`),
    el('button', { class: 'link', type: 'button', onclick: onExit }, 'Leave'));
  const title = el('h1', { class: 'reference' }, verse.reference);
  const hint = el('p', { class: 'muted' }, item.newCard ? 'New verse. Build it from the words below.' : '');
  const body = el('section', { class: 'exercise' });
  const button = el('button', { class: 'primary', type: 'button', disabled: true }, 'Check');
  root.replaceChildren(el('main', { class: 'session' }, header, title, hint, body), el('footer', { class: 'action-bar' }, button));

  const startedAt = performance.now();
  const ex = EXERCISES[type](body, {
    verse, library, seed: `${verse.id}:${card.reps}`,
    onReady: (ready) => { if (button.dataset.mode !== 'continue') button.disabled = !ready; },
  });

  let finished = null;
  button.onclick = async () => {
    if (button.dataset.mode !== 'continue') {
      const r = ex.check();
      button.dataset.mode = 'continue';
      button.textContent = 'Continue';
      button.disabled = true; // until the answer is saved
      if (r.final) finished = await record(r.correct);
      button.disabled = false;
      if (r.correct && navigator.vibrate) navigator.vibrate(10);
      return;
    }
    if (!finished && ex.next()) {
      button.dataset.mode = 'check';
      button.textContent = 'Check';
      button.disabled = true;
      return;
    }
    runSession(root, { library, verseById, active: finished, now, onSave, onExit, onDone });
  };

  async function record(correct) {
    if (active.kind !== 'extra') {
      const updated = answerCard(card, { correct, durationMs: performance.now() - startedAt, span: verse.verse_span }, now());
      await store.putCards([updated]);
      const retire = retirements(await store.getCards());
      if (retire.length) await store.putCards(retire);
    }
    const next = { ...active, index: active.index + 1, correct: active.correct + (correct ? 1 : 0) };
    await onSave(next);
    return next;
  }
}

export function renderSessionDone(root, { active, onHome }) {
  const n = active.items.length;
  root.replaceChildren(
    el('main', { class: 'session-done' },
      el('h1', {}, active.kind === 'comeback' ? 'Check-in complete' : 'Session complete'),
      el('p', {}, `${active.correct} of ${n} correct.`),
      active.kind === 'extra' ? el('p', { class: 'muted' }, 'Practice only. Your schedule is unchanged.') : null),
    el('footer', { class: 'action-bar' }, el('button', { class: 'primary', type: 'button', onclick: onHome }, 'Done')));
}
