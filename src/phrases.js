// Phrase splitting for the meet and phrase-order steps. Splits on clause
// punctuation, then merges fragments so each phrase is a sensible size.
// The phrases always rejoin, with single spaces, to exactly the input text.

const MIN_WORDS = 3;
const MAX_PHRASES = 6;
const words = (s) => s.split(' ').filter(Boolean);

function splitText(text) {
  const out = [];
  let cur = [];
  for (const w of words(text)) {
    cur.push(w);
    if (/[,;:.?!]['’)]?$/.test(w)) { out.push(cur.join(' ')); cur = []; }
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

function mergeSmall(parts) {
  const out = parts.slice();
  let changed = true;
  while (changed && out.length > 1) {
    changed = false;
    const i = out.findIndex((p) => words(p).length < MIN_WORDS);
    if (i === -1) break;
    // Merge into the shorter neighbour, preferring the next phrase.
    const j = i === out.length - 1 ? i - 1 : i === 0 ? 1 : words(out[i - 1]).length < words(out[i + 1]).length ? i - 1 : i + 1;
    const [a, b] = j < i ? [j, i] : [i, j];
    out.splice(a, 2, `${out[a]} ${out[b]}`);
    changed = true;
  }
  while (out.length > MAX_PHRASES) {
    let best = 0;
    for (let k = 1; k < out.length - 1; k++) {
      if (words(out[k]).length + words(out[k + 1]).length < words(out[best]).length + words(out[best + 1]).length) best = k;
    }
    out.splice(best, 2, `${out[best]} ${out[best + 1]}`);
  }
  return out;
}

// A one-clause verse of 8+ words is split in half at a word boundary so the
// order step still has something to order.
function halve(text) {
  const ws = words(text);
  if (ws.length < 8) return [text];
  const mid = Math.ceil(ws.length / 2);
  return [ws.slice(0, mid).join(' '), ws.slice(mid).join(' ')];
}

export function phrasesOf(verse) {
  const parts = mergeSmall(splitText(verse.text));
  return parts.length > 1 ? parts : halve(verse.text);
}
