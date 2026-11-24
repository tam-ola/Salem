// Blanks: fill missing words from a small bank (SPEC.md §5, tiers 2 and 3).
// The ratio sets the tier: 0.3 for early reviews, 0.6 for later ones.

import { tokenize, bareWord, normalizeWord, matchWord, isAccepted } from '../grading.js';
import { seededRandom, shuffle } from '../scheduler.js';
import { pickDecoys } from './decoys.js';
import { el, verseText } from '../ui/text.js';

// Pure: which token indices to blank. Deterministic from the seed; never the
// first word; prefers words of three or more letters.
export function chooseBlanks(tokens, ratio, seed) {
  const rand = seededRandom(`blanks:${seed}`);
  const count = Math.max(1, Math.round(tokens.length * ratio));
  const idx = tokens.map((_, i) => i).slice(1);
  const strong = shuffle(idx.filter((i) => tokens[i].norm.length >= 3), rand);
  const weak = shuffle(idx.filter((i) => tokens[i].norm.length < 3), rand);
  return [...strong, ...weak].slice(0, Math.min(count, idx.length)).sort((a, b) => a - b);
}

export function splitWord(display) {
  const m = display.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
  return { pre: m[1], core: m[2], post: m[3] };
}

export function buildBlanks(verse, library, seed, ratio = 0.3) {
  const tokens = tokenize(verse.text);
  const blanks = chooseBlanks(tokens, ratio, seed);
  const rand = seededRandom(`blankbank:${seed}`);
  const answers = blanks.map((i) => bareWord(tokens[i].display));
  const decoys = pickDecoys(verse, library, tokens.map((t) => t.norm), 2, rand);
  const bank = shuffle([...answers, ...decoys], rand).map((label, key) => ({ label, key }));
  return { tokens, blanks, bank };
}

export function mount(container, { verse, library, seed, ratio = 0.3, onReady }) {
  const { tokens, blanks, bank } = buildBlanks(verse, library, seed, ratio);
  const filled = new Map(); // token index -> bank key
  const hinted = new Set();
  let selected = blanks[0];
  let checked = false;
  let marks = null;
  let hints = 0;

  const text = el('div', { class: 'blanks-text verse' });
  const bankEl = el('div', { class: 'bank' });
  container.replaceChildren(
    el('span', { class: 'eyebrow' }, 'Fill in the missing words'),
    el('h2', { class: 'ref ref-sm' }, verse.reference),
    text, bankEl,
  );

  const firstEmpty = () => blanks.find((i) => !filled.has(i));
  const used = () => new Set(filled.values());

  function draw() {
    text.replaceChildren();
    tokens.forEach((t, i) => {
      if (i) text.append(' ');
      if (!blanks.includes(i)) { text.append(verseText(t.display)); return; }
      const { pre, core, post } = splitWord(t.display);
      const key = filled.get(i);
      const kind = marks?.get(i);
      const cls = ['blank', i === selected && !checked ? 'selected' : '', hinted.has(i) ? 'hinted' : '', kind ? (isAccepted(kind) ? 'ok' : 'wrong') : ''].join(' ');
      // Width is fixed by the hidden word so the line never reflows as it fills.
      const blank = el('button', {
        class: cls, type: 'button', disabled: checked, style: `--w:${core.length}`,
        'aria-label': key == null ? 'Empty blank' : `Blank: ${bank[key].label}`,
        onclick: () => { filled.delete(i); hinted.delete(i); selected = i; draw(); },
      }, key == null ? '' : verseText(bank[key].label));
      const word = el('span', { class: 'blank-word' }, el('span', {}, pre, blank, post));
      if (kind && !isAccepted(kind)) word.append(el('span', { class: 'expected-under' }, verseText(core)));
      text.append(word);
    });
    const u = used();
    bankEl.replaceChildren(...bank.map((c) => el('button', {
      class: 'chip', type: 'button', disabled: checked || u.has(c.key),
      onclick: () => {
        const target = filled.has(selected) || !blanks.includes(selected) ? firstEmpty() : selected;
        if (target == null) return;
        filled.set(target, c.key);
        selected = firstEmpty();
        draw();
      },
    }, verseText(c.label))));
    onReady(!checked && filled.size === blanks.length);
  }
  draw();

  const rightKey = (i) => {
    const open = bank.filter((c) => !used().has(c.key) && normalizeWord(c.label) === tokens[i].norm);
    return (open.find((c) => c.label === bareWord(tokens[i].display)) ?? open[0])?.key;
  };

  return {
    get hints() { return hints; },
    get wordCount() { return blanks.length; },
    hint() {
      if (checked) return;
      // Clear a wrong fill first, then fill the selected (or first open) blank.
      for (const [i, key] of filled) if (normalizeWord(bank[key].label) !== tokens[i].norm) filled.delete(i);
      const target = !filled.has(selected) && blanks.includes(selected) ? selected : firstEmpty();
      if (target == null) return;
      const key = rightKey(target);
      if (key == null) return;
      filled.set(target, key);
      hinted.add(target);
      hints++;
      selected = firstEmpty();
      draw();
    },
    giveUp() {
      for (const i of blanks) { filled.delete(i); }
      for (const i of blanks) filled.set(i, rightKey(i));
      checked = true;
      draw();
      return { final: true, correct: false, sheet: { kind: 'info', title: 'Here it is', body: el('div', {}, el('p', { class: 'verse' }, verseText(verse.text)), el('p', {}, 'Read it through once. It will come back later in this session.')) } };
    },
    check() {
      marks = new Map(blanks.map((i) => [i, matchWord(tokens[i].norm, normalizeWord(bank[filled.get(i)].label))]));
      checked = true;
      const correct = [...marks.values()].every(isAccepted);
      draw();
      if (correct) return { final: true, correct, sheet: { kind: 'ok', title: hints ? 'You got there' : 'Word perfect', body: hints ? `With ${hints} hint${hints > 1 ? 's' : ''}.` : 'Every word in place.' } };
      const modern = [...marks.values()].includes('modern');
      return { final: true, correct, sheet: { kind: 'bad', title: 'Nearly', body: modern ? 'Some words are the modern form. The KJV word is shown under each one.' : 'The right word is shown under each one you missed.' } };
    },
    next: () => false,
  };
}
