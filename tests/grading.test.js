import { test, assert, equal } from './assert.js';
import { loadLibrary, findVerse, words } from './fixtures.js';
import { normalizeWord, tokenize, matchWord, gradeAnswer, levenshtein, modernMessage } from '../src/grading.js';

const G = 'grading';
const replaceWordAt = (text, i, w) => { const ws = words(text); ws[i] = w; return ws.join(' '); };
const indexOfWord = (text, pred) => words(text).findIndex(pred);
const bare = (w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');

test(G, 'levenshtein basics', () => {
  equal(levenshtein('kitten', 'sitting'), 3);
  equal(levenshtein('', 'abc'), 3);
  equal(levenshtein('same', 'same'), 0);
});

test(G, 'curly and straight apostrophes normalize the same', () => {
  equal(normalizeWord('hinds’'), normalizeWord("hinds'"));
  equal(normalizeWord('LORD’s'), "lord's", 'word-internal apostrophe kept');
  equal(normalizeWord('‘word’'), 'word', 'edge apostrophes stripped');
});

test(G, 'a library verse with a curly apostrophe accepts a straight one', async () => {
  const lib = await loadLibrary();
  const v = findVerse(lib, (x) => x.text.includes('’'), 'curly apostrophe');
  const r = gradeAnswer(v.text, v.text.replaceAll('’', "'"));
  assert(r.correct, `${v.reference} should grade correct`);
  equal(r.counts.exact, tokenize(v.text).length);
});

test(G, 'LORD and Lord are the same token for grading', async () => {
  const lib = await loadLibrary();
  equal(normalizeWord('LORD'), normalizeWord('Lord'));
  const v = findVerse(lib, (x) => /\bLORD\b/.test(x.text) && x.word_count < 30, 'LORD');
  const r = gradeAnswer(v.text, v.text.replace(/\bLORD\b/g, 'Lord'));
  assert(r.correct, v.reference);
  const r2 = gradeAnswer(v.text, v.text.toLowerCase());
  assert(r2.correct, 'case-insensitive overall');
});

test(G, 'punctuation and whitespace are ignored', async () => {
  const lib = await loadLibrary();
  const v = findVerse(lib, (x) => /[,:;]/.test(x.text) && x.word_count < 25, 'punctuated');
  const stripped = v.text.replace(/[,.:;?!()]/g, '').replace(/\s+/g, '   ');
  assert(gradeAnswer(v.text, stripped).correct);
});

test(G, 'Levenshtein-1 near miss on a 5+ letter word is correct but close', async () => {
  const lib = await loadLibrary();
  const v = findVerse(lib, (x) => x.track === 'verse' && words(x.text).some((w) => /^[a-z]{6,}$/.test(w)), 'long word');
  const i = indexOfWord(v.text, (w) => /^[a-z]{6,}$/.test(w));
  const w = words(v.text)[i];
  const typo = w.slice(0, 2) + w.slice(3); // drop the third letter
  const r = gradeAnswer(v.text, replaceWordAt(v.text, i, typo));
  assert(r.correct, `${typo} for ${w} should be accepted`);
  equal(r.counts.close, 1);
  const op = r.ops.find((o) => o.kind === 'close');
  equal(op.expected.display, w, 'correct spelling available for display');
});

test(G, 'short words must match exactly', () => {
  equal(matchWord('unto', 'into'), 'wrong');
  equal(matchWord('the', 'thee'), 'wrong');
  equal(matchWord('thee', 'the'), 'wrong');
  equal(matchWord('mercy', 'mercey'), 'close');
  equal(matchWord('mercy', 'marcey'), 'wrong', 'distance 2');
});

test(G, 'modern substitutions are rejected, not close', () => {
  equal(matchWord('thy', 'your'), 'modern');
  equal(matchWord('thee', 'you'), 'modern');
  equal(matchWord('saith', 'said'), 'modern');
  equal(matchWord('shalt', 'shall'), 'modern', 'distance 1 but still rejected');
  equal(matchWord('spake', 'spoke'), 'modern', 'distance 1 but still rejected');
  equal(matchWord('trusteth', 'trusts'), 'modern');
  equal(matchWord('loveth', 'loves'), 'modern');
  equal(matchWord('knowest', 'know'), 'modern');
});

test(G, '"your" for "thy" in a real verse fails with specific feedback', async () => {
  const lib = await loadLibrary();
  const v = findVerse(lib, (x) => words(x.text).some((w) => bare(w) === 'thy') && x.word_count < 40, 'thy');
  const i = indexOfWord(v.text, (w) => bare(w) === 'thy');
  const r = gradeAnswer(v.text, replaceWordAt(v.text, i, 'your'));
  assert(!r.correct, 'must not be accepted');
  equal(r.counts.modern, 1);
  const op = r.ops.find((o) => o.op === 'sub');
  equal(op.kind, 'modern');
  equal(bare(op.given.display), 'your');
  equal(modernMessage(op.expected.display), 'KJV has “thy” here.');
  equal(r.ops.filter((o) => o.op !== 'match').length, 1, 'only that word is marked');
});

test(G, 'dropping one word from the middle of a long verse aligns as a single gap', async () => {
  const lib = await loadLibrary();
  const v = findVerse(lib, (x) => x.verse_span === 1 && x.word_count >= 40, 'long verse');
  const ws = words(v.text);
  const mid = Math.floor(ws.length / 2);
  const given = [...ws.slice(0, mid), ...ws.slice(mid + 1)].join(' ');
  const r = gradeAnswer(v.text, given);
  assert(!r.correct);
  equal(r.counts.missing, 1, `${v.reference} (${ws.length} words)`);
  equal(r.counts.wrong + r.counts.extra + r.counts.modern, 0, 'nothing else marked');
  equal(r.ops.length, tokenize(v.text).length);
  // The gap is a word equal to the dropped one (repeated words may shift it).
  const gap = r.ops.find((o) => o.op === 'missing');
  equal(gap.expected.norm, normalizeWord(ws[mid]));
});

test(G, 'dropping a word in every long verse never misaligns the rest', async () => {
  const lib = await loadLibrary();
  const long = lib.verses.filter((x) => x.word_count >= 30 && x.word_count <= 120);
  for (const v of long) {
    const ws = words(v.text);
    const mid = Math.floor(ws.length / 2);
    if (!normalizeWord(ws[mid])) continue;
    const r = gradeAnswer(v.text, [...ws.slice(0, mid), ...ws.slice(mid + 1)].join(' '));
    equal([r.counts.missing, r.counts.wrong, r.counts.extra], [1, 0, 0], v.reference);
  }
});

test(G, 'an inserted word is marked extra; a wrong word is a substitution', async () => {
  const lib = await loadLibrary();
  const v = findVerse(lib, (x) => x.word_count >= 15 && x.word_count < 30, 'medium verse');
  const ws = words(v.text);
  const inserted = [...ws.slice(0, 5), 'zebra', ...ws.slice(5)].join(' ');
  const r = gradeAnswer(v.text, inserted);
  equal([r.counts.extra, r.counts.missing, r.counts.wrong], [1, 0, 0]);
  const r2 = gradeAnswer(v.text, replaceWordAt(v.text, 5, 'zebra'));
  equal([r2.counts.wrong, r2.counts.missing, r2.counts.extra], [1, 0, 0]);
});

test(G, 'empty answer is all missing, and the whole library grades itself correct', async () => {
  const lib = await loadLibrary();
  const v = lib.verses[0];
  const r = gradeAnswer(v.text, '');
  assert(!r.correct);
  equal(r.counts.missing, tokenize(v.text).length);
  for (const x of lib.verses) assert(gradeAnswer(x.text, x.text).correct, x.reference);
});
