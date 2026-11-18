// Word-level diff rendering. Wrongness is shown by shape and weight as well
// as colour: strike-through, a marked gap, an inserted mark (SPEC.md §7).

import { el, verseText } from './text.js';
import { bareWord, modernMessage } from '../grading.js';

const word = (display) => el('span', {}, verseText(display));

export function renderDiff(result) {
  const line = el('div', { class: 'diff verse', role: 'group', 'aria-label': 'Your answer compared with the verse' });
  const notes = [];
  for (const o of result.ops) {
    line.append(' ');
    if (o.op === 'match' && o.kind === 'exact') {
      line.append(el('span', { class: 'w ok' }, word(o.expected.display)));
    } else if (o.op === 'match') {
      line.append(el('span', { class: 'w close', title: 'Close: check the spelling' },
        word(o.expected.display), el('span', { class: 'sr' }, ' (close spelling)')));
    } else if (o.op === 'sub') {
      if (o.kind === 'modern') notes.push(modernMessage(o.expected.display));
      line.append(el('span', { class: 'w sub' },
        el('s', { class: 'given' }, bareWord(o.given.display)),
        el('span', { class: 'expected' }, word(o.expected.display))));
    } else if (o.op === 'missing') {
      line.append(el('span', { class: 'w missing' },
        el('span', { class: 'gap', 'aria-hidden': 'true' }, ' '),
        el('span', { class: 'expected' }, word(o.expected.display)),
        el('span', { class: 'sr' }, ' (missing)')));
    } else if (o.op === 'extra') {
      line.append(el('span', { class: 'w extra' },
        el('ins', {}, bareWord(o.given.display)), el('span', { class: 'sr' }, ' (extra)')));
    }
  }
  const wrap = el('div', { class: 'feedback' }, line);
  for (const n of new Set(notes)) wrap.append(el('p', { class: 'note' }, n));
  return wrap;
}
