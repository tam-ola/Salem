// Order the phrases: tap the verse's phrases into the right order. Practice
// only, used when meeting a new verse.

import { phrasesOf } from '../phrases.js';
import { seededRandom, shuffle } from '../scheduler.js';
import { el, verseText } from '../ui/text.js';

export function scrambled(count, seed) {
  const order = [...Array(count).keys()];
  if (count < 2) return order;
  let out = shuffle(order, seededRandom(`phrases:${seed}`));
  if (out.every((v, i) => v === i)) out = [...out.slice(1), out[0]];
  return out;
}

export function mount(container, { verse, seed, onReady }) {
  const phrases = phrasesOf(verse);
  const order = scrambled(phrases.length, seed);
  let slots = [];
  let checked = false;

  const slotsEl = el('div', { class: 'slots' });
  const tiles = el('div', { class: 'tiles' });
  container.replaceChildren(el('span', { class: 'eyebrow' }, 'Put the phrases in order'), el('h2', { class: 'ref ref-sm' }, verse.reference), slotsEl, tiles);

  function draw() {
    slotsEl.replaceChildren(...phrases.map((_, i) => {
      const p = slots[i];
      if (p == null) return el('div', { class: 'slot' }, el('span', { class: 'muted small' }, String(i + 1)));
      const cls = `slot filled ${checked ? (p === i ? 'good' : 'bad') : ''}`;
      return el('button', { class: cls, type: 'button', disabled: checked, onclick: () => { slots = slots.slice(0, i); draw(); } }, verseText(phrases[p]));
    }));
    tiles.replaceChildren(...order.map((p) => el('button', {
      class: 'tile', type: 'button', disabled: checked || slots.includes(p),
      onclick: () => { slots = [...slots, p]; draw(); },
    }, verseText(phrases[p]))));
    onReady(!checked && slots.length === phrases.length);
  }
  draw();

  return {
    check() {
      checked = true;
      const ok = slots.every((p, i) => p === i);
      draw();
      return {
        final: true, correct: ok,
        sheet: ok
          ? { kind: 'ok', title: 'Right order', body: 'Each phrase leads into the next. Now the words.' }
          : { kind: 'bad', title: 'Here is the order', body: el('p', { class: 'verse' }, verseText(phrases.join(' / '))) },
      };
    },
    next: () => false,
  };
}
