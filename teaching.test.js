import { test, assert, equal } from './assert.js';
import { loadLibrary } from './fixtures.js';
import { BOOKS, SECTIONS, locate, bookIndex } from '../src/bible.js';
import { phrasesOf } from '../src/phrases.js';
import { planSteps, withRepeat, MAX_REPEATS } from '../src/sessionplan.js';
import { buildRefChoice } from '../src/exercises/refchoice.js';
import { scrambled } from '../src/exercises/phrases.js';
import { streak, stageOf } from '../src/progress.js';
import * as S from '../src/scheduler.js';

const G = 'teaching';
const T0 = new Date(2026, 4, 4, 7, 0).getTime();

test(G, 'the Bible has 66 books in 9 sections, and every library book is found', async () => {
  const lib = await loadLibrary();
  equal(BOOKS.length, 66);
  equal(new Set(BOOKS).size, 66);
  equal(SECTIONS.length, 9);
  equal(locate('Psalms').bookNumber, 19);
  equal(locate('Psalms').section.name, 'Poetry');
  equal(bookIndex('Revelation'), 65);
  for (const v of lib.verses) assert(locate(v.book), `unknown book ${v.book}`);
});

test(G, 'phrases rejoin exactly to the verse text, for every verse', async () => {
  const lib = await loadLibrary();
  for (const v of lib.verses) {
    const p = phrasesOf(v);
    equal(p.join(' '), v.text, v.reference);
    assert(p.length >= 1 && p.length <= 6, `${v.reference}: ${p.length} phrases`);
  }
  const multi = lib.starter_path.map((id) => lib.verses.find((v) => v.id === id)).filter((v) => phrasesOf(v).length > 1);
  assert(multi.length >= 16, `most starter verses have phrases to order (${multi.length}/20)`);
});

test(G, 'phrase order is never presented already solved', () => {
  for (let n = 2; n <= 6; n++) for (let s = 0; s < 50; s++) {
    const o = scrambled(n, `x${s}`);
    equal([...o].sort(), [...Array(n).keys()]);
    assert(!o.every((v, i) => v === i), `n=${n} seed=${s}`);
  }
});

test(G, 'a new verse is taught before it is tested, and only the build step is graded', async () => {
  const library = await loadLibrary();
  const verseById = new Map(library.verses.map((v) => [v.id, v]));
  const session = S.assembleSession(S.makeContext({ library, cards: [] }), T0);
  const steps = planSteps(session, verseById);
  for (const { card } of session.items) {
    const mine = steps.filter((s) => s.verseId === card.verseId);
    const kinds = mine.map((s) => s.kind);
    assert(kinds.indexOf('meet') < kinds.indexOf('build'), `${card.verseId}: meet before build`);
    assert(kinds.includes('where'), 'finds it in the Bible');
    equal(mine.filter((s) => s.graded).map((s) => s.cardId), [card.id], 'exactly one graded step');
    equal(kinds.at(-1), 'blanks', 'one more go at the end');
  }
  assert(steps.length >= 8, `a first session has substance (${steps.length} steps)`);
  equal(steps.map((s) => s.id), steps.map((_, i) => i));
});

test(G, 'every review card gets exactly one graded step; reference skills get reference steps', async () => {
  const library = await loadLibrary();
  const verseById = new Map(library.verses.map((v) => [v.id, v]));
  const ids = library.starter_path.slice(0, 6);
  const mk = (id, skill, interval) => ({ ...S.createCard(id, skill, T0 - 20 * S.DAY), state: 'review', interval, due: T0 - S.DAY, lastSeen: T0 - 5 * S.DAY });
  const cards = [mk(ids[0], 'ref2text', 3), mk(ids[1], 'ref2text', 10), mk(ids[2], 'book', 3), mk(ids[3], 'text2ref', 3)];
  const session = S.assembleSession(S.makeContext({ library, cards }), T0);
  const steps = planSteps(session, verseById);
  for (const { card, isNew } of session.items) {
    if (isNew && card.skill === 'ref2text') continue;
    equal(steps.filter((s) => s.graded && s.cardId === card.id).length, 1, card.id);
  }
  const kindOf = (c) => steps.find((s) => s.cardId === c.id);
  equal([kindOf(cards[0]).kind, kindOf(cards[0]).ratio], ['blanks', 0.3]);
  equal([kindOf(cards[1]).kind, kindOf(cards[1]).ratio], ['blanks', 0.6]);
  equal(kindOf(cards[2]).kind, 'book');
  equal(kindOf(cards[3]).kind, 'ref');
});

test(G, 'extra practice is never graded', async () => {
  const library = await loadLibrary();
  const verseById = new Map(library.verses.map((v) => [v.id, v]));
  const card = { ...S.createCard(library.starter_path[0], 'ref2text', T0), state: 'review', interval: 35, recent: [true, true], due: T0 + 20 * S.DAY };
  const steps = planSteps(S.assembleExtraPractice(S.makeContext({ library, cards: [card] }), T0), verseById);
  assert(steps.length === 1 && !steps[0].graded);
});

test(G, 'misses are repeated as practice, at most three times, so a session always ends', () => {
  let steps = [{ id: 0, kind: 'build', verseId: 'a', graded: true }, { id: 1, kind: 'blanks', ratio: 0.3, verseId: 'b', graded: true }];
  steps = withRepeat(steps, steps[0]);
  equal(steps[2], { id: 2, kind: 'build', ratio: undefined, verseId: 'a', graded: false, repeatOf: 0 });
  steps = withRepeat(steps, steps[2]);
  equal(steps.length, 3, 'a repeat is not repeated again');
  for (let i = 0; i < 10; i++) steps = withRepeat(steps, steps[1]);
  equal(steps.filter((s) => s.repeatOf != null).length, MAX_REPEATS);
});

test(G, 'reference choices: correct answer present, four unique, wrong ones real and nearby', async () => {
  const lib = await loadLibrary();
  const refs = new Set(lib.verses.map((v) => v.reference));
  for (const v of lib.verses.filter((x) => x.track !== 'reflection')) {
    const p = buildRefChoice(v, lib, 'seed', 'where');
    equal(p.stages, ['section', 'book', 'ref']);
    assert(p.books.includes(v.book) && new Set(p.books).size === 4, `${v.reference} books ${p.books}`);
    assert(p.refs.includes(v.reference) && new Set(p.refs).size === p.refs.length && p.refs.length >= 2, `${v.reference} refs ${p.refs}`);
    const sameBook = (r) => r.startsWith(v.reference.replace(/\s\d[\w:,-]*$/, ''));
    assert(p.refs.every((r) => refs.has(r) || sameBook(r)), `${v.reference}: ${p.refs}`);
    const near = p.books.filter((b) => b !== v.book).every((b) => Math.abs(bookIndex(b) - bookIndex(v.book)) <= 20);
    assert(near, `${v.reference}: book choices near ${p.books}`);
  }
  equal(buildRefChoice(lib.verses[0], lib, 's', 'book').stages, ['section', 'book']);
  equal(buildRefChoice(lib.verses[0], lib, 's', 'ref').stages, ['ref']);
});

const key = (d) => S.dayKey(T0 + d * S.DAY);

test(G, 'watering streak counts consecutive days, today not yet done does not break it', () => {
  equal(streak([], T0).days, 0);
  equal(streak([key(0)], T0).days, 1);
  equal(streak([key(-2), key(-1)], T0).days, 2, 'yesterday and before, today still open');
  equal(streak([key(-2), key(-1), key(0)], T0).days, 3);
});

test(G, 'two rest days in 30 bridge missed days; a third gap breaks the streak', () => {
  const s = streak([key(-4), key(-2), key(0)], T0);
  equal([s.days, s.restLeft], [3, 0]);
  equal(s.week.map((d) => d.state).slice(-5), ['watered', 'rest', 'watered', 'rest', 'watered']);
  const broken = streak([key(-6), key(-4), key(-2), key(0)], T0);
  equal(broken.days, 3, 'the third gap is not bridged');
  const long = streak([key(-10), key(-6), key(0)], T0);
  equal(long.days, 1, 'a long gap needs more rest days than there are');
  equal(long.restLeft, 2, 'unbridged misses do not spend rest days');
});

test(G, 'growth stage follows the card', () => {
  const c = S.createCard('psa-16-1', 'ref2text', T0);
  equal(stageOf(undefined), 0);
  equal(stageOf(c), 0);
  equal(stageOf({ ...c, state: 'learning' }), 1);
  equal(stageOf({ ...c, state: 'review', interval: 7, recent: [true] }), 2);
  equal(stageOf({ ...c, state: 'review', interval: 35, recent: [true, true] }), 3);
});
