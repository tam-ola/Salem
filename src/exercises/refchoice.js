// Where is it found? Three stages: which part of the Bible, which book, which
// reference. `mode` picks the stages:
//   'where' — all three, used when meeting a new verse (practice)
//   'book'  — part and book, for the `book` skill
//   'ref'   — the reference, for the `text2ref` skill
// Wrong answers are always real and nearby, never random (SPEC.md §5).

import { SECTIONS, BOOKS, bookIndex, locate } from '../bible.js';
import { seededRandom, shuffle } from '../scheduler.js';
import { el, verseText } from '../ui/text.js';

export function bookChoices(book, rand) {
  const { section } = locate(book);
  let pool = section.books.filter((b) => b !== book);
  if (pool.length < 3) {
    const i = bookIndex(book);
    const near = BOOKS.filter((b) => b !== book && !pool.includes(b)).sort((a, b) => Math.abs(bookIndex(a) - i) - Math.abs(bookIndex(b) - i));
    pool = [...pool, ...near.slice(0, 3 - pool.length)];
  }
  return shuffle([book, ...shuffle(pool, rand).slice(0, 3)], rand);
}

export function refChoices(verse, library, rand) {
  const picks = [];
  const add = (r) => { if (r && r !== verse.reference && !picks.includes(r)) picks.push(r); };
  verse.confusables.forEach(add);
  const sameBook = library.verses
    .filter((v) => v.book === verse.book && v.track !== 'reflection')
    .sort((a, b) => Math.abs(a.chapter - verse.chapter) - Math.abs(b.chapter - verse.chapter) || Math.abs(a.verse_start - verse.verse_start) - Math.abs(b.verse_start - verse.verse_start));
  sameBook.forEach((v) => add(v.reference));
  const name = verse.reference.replace(/\s\d[\w:,-]*$/, '');
  for (let d = 1; picks.length < 3 && d < 5; d++) add(`${name} ${verse.chapter}:${verse.verse_start + d}`);
  return shuffle([verse.reference, ...picks.slice(0, 3)], rand);
}

export function buildRefChoice(verse, library, seed, mode) {
  const rand = seededRandom(`ref:${seed}`);
  const stages = mode === 'ref' ? ['ref'] : mode === 'book' ? ['section', 'book'] : ['section', 'book', 'ref'];
  return { stages, sectionIndex: locate(verse.book).sectionIndex, books: bookChoices(verse.book, rand), refs: refChoices(verse, library, rand) };
}

export function mount(container, { verse, library, seed, mode = 'where', onReady }) {
  const plan = buildRefChoice(verse, library, seed, mode);
  let stage = 0;
  let pick = null;
  let checked = false;
  let allRight = true;
  const right = () => ({ section: plan.sectionIndex, book: verse.book, ref: verse.reference }[plan.stages[stage]]);

  function draw() {
    const kind = plan.stages[stage];
    const prompt = { section: 'Which part of the Bible?', book: 'Which book?', ref: 'Which reference?' }[kind];
    const state = (value) => (checked ? (value === right() ? 'right' : value === pick ? 'wrong' : '') : value === pick ? 'sel' : '');
    let choices;
    if (kind === 'section') {
      choices = el('div', { class: 'map' });
      SECTIONS.forEach((s, i) => {
        if (i === 0 || SECTIONS[i - 1].testament !== s.testament) choices.append(el('span', { class: 'testament' }, s.testament));
        choices.append(el('button', { class: `sect ${state(i)}`, type: 'button', disabled: checked, 'aria-pressed': String(pick === i),
          onclick: () => { pick = i; draw(); } }, s.name, el('small', {}, `${s.books.length} book${s.books.length > 1 ? 's' : ''}`)));
      });
    } else {
      const list = kind === 'book' ? plan.books : plan.refs;
      choices = el('div', { class: 'choices' }, ...list.map((value) => el('button', {
        class: `choice ${state(value)}`, type: 'button', disabled: checked, 'aria-pressed': String(pick === value),
        onclick: () => { pick = value; draw(); },
      }, value)));
    }
    const steps = plan.stages.length > 1 ? el('span', { class: 'muted small' }, `${stage + 1} of ${plan.stages.length}`) : null;
    container.replaceChildren(
      el('div', { class: 'row2' }, el('span', { class: 'eyebrow' }, 'Where is it found?'), steps),
      el('p', { class: 'verse' }, verseText(verse.text)),
      el('p', { class: 'prompt' }, prompt),
      choices,
    );
    onReady(!checked && pick != null);
  }
  draw();

  function sheet(ok) {
    const kind = plan.stages[stage];
    const loc = locate(verse.book);
    if (kind === 'section') {
      const books = loc.section.books.join(', ');
      return { kind: ok ? 'ok' : 'bad', title: ok ? `Yes, ${loc.section.name.toLowerCase()}` : `It is in ${loc.section.name.toLowerCase()}`, body: `${loc.section.testament}: ${books}.` };
    }
    if (kind === 'book') return { kind: ok ? 'ok' : 'bad', title: ok ? verse.book : `It is in ${verse.book}`, body: `Book ${loc.bookNumber} of 66.` };
    return {
      kind: ok ? 'ok' : 'bad',
      title: ok ? verse.reference : `It is ${verse.reference}`,
      body: ok ? 'Words and address together.' : `${pick} is nearby, which is why it is easy to mix up.`,
    };
  }

  return {
    check() {
      checked = true;
      const ok = pick === right();
      allRight = allRight && ok;
      draw();
      return { final: stage === plan.stages.length - 1, correct: allRight, sheet: sheet(ok) };
    },
    next() {
      if (stage >= plan.stages.length - 1) return false;
      stage++; pick = null; checked = false; draw();
      return true;
    },
  };
}
