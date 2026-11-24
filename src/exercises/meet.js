// Meet the verse: the first time a verse is seen. Reveals it phrase by phrase,
// shows where it sits in the Bible and, where there is one, the plain-English
// gloss. Nothing is scored.

import { phrasesOf } from '../phrases.js';
import { locate, BOOKS, SECTIONS } from '../bible.js';
import { el, verseText } from '../ui/text.js';
import { pin } from '../ui/icons.js';

export function bibleStrip(book) {
  const loc = locate(book);
  const strip = el('div', { class: 'strip', role: 'img', 'aria-label': `${book}: book ${loc.bookNumber} of 66, ${loc.section.testament}, ${loc.section.name.toLowerCase()}` });
  for (const b of BOOKS) {
    const inSection = loc.section.books.includes(b);
    strip.append(el('i', { class: b === book ? 'on' : inSection ? 'sec-on' : '' }));
  }
  const ntStart = SECTIONS.findIndex((s) => s.testament === 'New Testament');
  return el('div', { class: 'where' },
    el('span', { class: 'where-chip' }, pin(), el('span', {}, `${loc.section.testament} · ${loc.section.name} · `, el('b', {}, book), `, book ${loc.bookNumber} of 66`)),
    strip,
    el('div', { class: 'strip-key' }, el('span', {}, BOOKS[0]), el('span', {}, `${SECTIONS[ntStart - 1].books.at(-1)} | ${SECTIONS[ntStart].books[0]}`), el('span', {}, BOOKS.at(-1))));
}

export function mount(container, { verse, onReady }) {
  const phrases = phrasesOf(verse);
  let shown = 1;
  const text = el('p', { class: 'verse reveal' });
  const after = el('div', { class: 'stack' });
  container.replaceChildren(
    el('span', { class: 'eyebrow' }, 'New verse · meet it'),
    el('h2', { class: 'ref' }, verse.reference),
    bibleStrip(verse.book),
    text,
    after,
  );

  function draw() {
    text.replaceChildren();
    phrases.forEach((p, i) => {
      if (i) text.append(' ');
      text.append(el('span', { class: i < shown ? 'shown' : 'hid', 'aria-hidden': i < shown ? null : 'true' }, verseText(p)));
    });
    const done = shown >= phrases.length;
    after.replaceChildren(...(done
      ? [verse.gloss ? el('p', { class: 'gloss' }, el('b', {}, 'In plain words: '), verse.gloss) : null,
         el('p', { class: 'muted' }, 'Read it aloud once. Then build it from the words.')]
      : [el('p', { class: 'muted' }, 'Read each phrase, then reveal the next.')]));
    onReady(true);
  }
  draw();

  return {
    label: () => (shown >= phrases.length ? 'I’ve read it' : 'Reveal next phrase'),
    // Returns true once the whole verse has been read.
    press() {
      if (shown >= phrases.length) return true;
      shown++;
      draw();
      return false;
    },
  };
}
