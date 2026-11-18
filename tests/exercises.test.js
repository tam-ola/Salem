import { test, assert, equal } from './assert.js';
import { loadLibrary, findVerse } from './fixtures.js';
import { tokenize, bareWord, normalizeWord } from '../src/grading.js';
import { buildWordBank } from '../src/exercises/wordbank.js';
import { chooseBlanks, buildBlanks, splitWord } from '../src/exercises/blanks.js';

const G = 'exercises';
const sortStr = (xs) => xs.slice().sort();

test(G, 'word bank holds every word of the verse plus 2–4 decoys from the same book', async () => {
  const lib = await loadLibrary();
  for (const id of lib.starter_path) {
    const v = lib.verses.find((x) => x.id === id);
    const segs = buildWordBank(v, lib, `${id}:0`);
    equal(segs.map((s) => s.text).join(' '), v.text, `${id} segments rejoin`);
    for (const s of segs) {
      const real = s.chips.filter((c) => !c.decoy).map((c) => c.label);
      equal(sortStr(real), sortStr(tokenize(s.text).map((t) => bareWord(t.display))), id);
      const decoys = s.chips.filter((c) => c.decoy);
      assert(decoys.length >= 2 && decoys.length <= 4, `${id}: ${decoys.length} decoys`);
      const inSeg = new Set(tokenize(s.text).map((t) => t.norm));
      assert(decoys.every((d) => !inSeg.has(normalizeWord(d.label))), `${id}: decoy duplicates a real word`);
      // From the same book whenever that book has enough other words; only a
      // thinly represented book (e.g. Daniel here) falls back to the library.
      const bookWords = new Set(lib.verses.filter((x) => x.book === v.book && x.id !== v.id)
        .flatMap((x) => tokenize(x.text).map((t) => t.norm)).filter((w) => w.length >= 3 && !inSeg.has(w)));
      if (bookWords.size >= decoys.length) {
        assert(decoys.every((d) => bookWords.has(normalizeWord(d.label))), `${id}: decoys from the same book`);
      }
    }
  }
});

test(G, 'word bank works chunk by chunk above 25 words, and is deterministic', async () => {
  const lib = await loadLibrary();
  const v = findVerse(lib, (x) => x.word_count > 25 && x.chunks.length > 1 && x.track === 'verse', 'long verse');
  const segs = buildWordBank(v, lib, 'seed');
  equal(segs.map((s) => s.text), v.chunks);
  equal(JSON.stringify(buildWordBank(v, lib, 'seed')), JSON.stringify(segs), 'same seed, same chips');
});

test(G, 'blanks: ~30%, never the first word, stable per seed, varies with reps', async () => {
  const lib = await loadLibrary();
  let varied = 0;
  for (const id of lib.starter_path) {
    const v = lib.verses.find((x) => x.id === id);
    const tokens = tokenize(v.text);
    const a = chooseBlanks(tokens, 0.3, `${id}:3`);
    equal(a.length, Math.max(1, Math.round(tokens.length * 0.3)), id);
    assert(!a.includes(0), `${id}: first word blanked`);
    equal(chooseBlanks(tokens, 0.3, `${id}:3`), a, 'refresh does not reshuffle');
    if (JSON.stringify(chooseBlanks(tokens, 0.3, `${id}:4`)) !== JSON.stringify(a)) varied++;
  }
  assert(varied >= 15, `a repeat differs for most verses (${varied}/20)`);
});

test(G, 'blank bank contains each hidden word plus two decoys', async () => {
  const lib = await loadLibrary();
  const v = lib.verses.find((x) => x.id === lib.starter_path[10]);
  const { tokens, blanks, bank } = buildBlanks(v, lib, 'x');
  const hidden = blanks.map((i) => bareWord(tokens[i].display));
  equal(bank.length, hidden.length + 2);
  for (const h of hidden) assert(bank.some((b) => b.label === h), h);
});

test(G, 'splitWord keeps punctuation outside the blank', () => {
  equal(splitWord('thee,'), { pre: '', core: 'thee', post: ',' });
  equal(splitWord('(and'), { pre: '(', core: 'and', post: '' });
  equal(splitWord('hinds’'), { pre: '', core: 'hinds', post: '’' });
});
