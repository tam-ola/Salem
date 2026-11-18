// Decoy words for word banks: drawn from elsewhere in the same book, so a
// wrong chip is plausible rather than random vocabulary (SPEC.md §5).

import { tokenize, bareWord } from '../grading.js';
import { shuffle } from '../scheduler.js';

export function pickDecoys(verse, library, excludeNorms, count, rand) {
  const exclude = new Set(excludeNorms);
  const pool = new Map(); // norm -> display word
  const collect = (verses) => {
    for (const v of verses) {
      if (v.id === verse.id) continue;
      for (const t of tokenize(v.text)) {
        if (t.norm.length < 3 || exclude.has(t.norm) || pool.has(t.norm)) continue;
        pool.set(t.norm, bareWord(t.display));
      }
    }
  };
  collect(library.verses.filter((v) => v.book === verse.book));
  if (pool.size < count) collect(library.verses);
  // Sort first so the seeded shuffle is stable whatever order the data is in.
  const sorted = [...pool.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return shuffle(sorted, rand).slice(0, count).map(([, display]) => display);
}

export const decoyCount = (wordCount) => 2 + (wordCount > 12 ? 1 : 0) + (wordCount > 20 ? 1 : 0);
