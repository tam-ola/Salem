// Grading: normalization, fuzzy word matching and word-level diff alignment.
// Pure functions, no DOM. See SPEC.md §7.

const APOSTROPHES = /[‘’ʼ′`´]/g;
const NOT_WORD = /[^\p{L}\p{N}']+/gu;
const EDGE_APOSTROPHES = /^'+|'+$/g;

// One display word -> its comparison form. LORD and Lord both become "lord",
// so they are the same token for grading while staying distinct on screen.
export function normalizeWord(raw) {
  return String(raw)
    .normalize('NFKC')
    .replace(APOSTROPHES, "'")
    .toLowerCase()
    .replace(NOT_WORD, '')
    .replace(EDGE_APOSTROPHES, '');
}

// Text -> [{ display, norm }]. Tokens that normalize to nothing (a lone
// dash, stray punctuation) are dropped.
export function tokenize(text) {
  return String(text)
    .normalize('NFKC')
    .split(/\s+/)
    .filter(Boolean)
    .map((display) => ({ display, norm: normalizeWord(display) }))
    .filter((t) => t.norm.length > 0);
}

export function normalizeText(text) {
  return tokenize(text).map((t) => t.norm).join(' ');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const sub = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      cur[j] = Math.min(sub, prev[j] + 1, cur[j - 1] + 1);
    }
    prev = cur;
  }
  return prev[b.length];
}

// Archaic KJV form -> modern words that must be rejected, not accepted as close.
const MODERN = {
  thy: ['your'], thee: ['you'], thou: ['you'], thine: ['your', 'yours'],
  ye: ['you'], saith: ['says', 'said'], hath: ['has'], doth: ['does'],
  dost: ['do', 'does'], art: ['are'], shalt: ['shall', 'will'], wilt: ['will'],
  hast: ['have', 'has'], hadst: ['had'], didst: ['did'], wast: ['was', 'were'],
  unto: ['to'], spake: ['spoke'], mine: ['my'], shew: ['show'],
  shewed: ['showed'], sware: ['swore'], brake: ['broke'], ere: ['before'],
  yea: ['yes'], nay: ['no'], whence: ['where'], hither: ['here'],
  thither: ['there'], wherefore: ['why'], begat: ['fathered'],
};

function isModernFor(expected, given) {
  if (MODERN[expected]?.includes(given)) return true;
  // -eth verbs: trusteth -> trusts, loveth -> loves, goeth -> goes
  if (expected.length > 4 && expected.endsWith('eth')) {
    const stem = expected.slice(0, -3);
    if (given === stem + 's' || given === stem + 'es') return true;
  }
  // -est verbs: knowest -> know, givest -> give
  if (expected.length > 4 && expected.endsWith('est')) {
    if (given === expected.slice(0, -3) || given === expected.slice(0, -2)) return true;
  }
  return false;
}

// Compare two normalized words.
// 'exact' | 'close' (accepted, show spelling) | 'modern' (rejected) | 'wrong'
export function matchWord(expected, given) {
  if (expected === given) return 'exact';
  if (isModernFor(expected, given)) return 'modern';
  if (expected.length >= 5 && Math.abs(expected.length - given.length) <= 1 && levenshtein(expected, given) <= 1) {
    return 'close';
  }
  return 'wrong';
}

export const isAccepted = (kind) => kind === 'exact' || kind === 'close';

// Alignment costs. A wrong word costs less than a drop plus an insert, so it
// pairs as a substitution; a modern form pairs more readily still, so
// "your" sits under "thy" rather than floating as an extra word.
const COST = { exact: 0, close: 0.01, modern: 0.5, wrong: 1, gap: 1 };

// Token-level weighted edit distance (an LCS alignment that also pairs
// substitutions). A single dropped word costs one gap and leaves the rest of
// the verse aligned.
export function align(expected, given) {
  const n = expected.length;
  const m = given.length;
  const kind = (i, j) => matchWord(expected[i].norm, given[j].norm);
  const d = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i++) d[i][0] = i * COST.gap;
  for (let j = 1; j <= m; j++) d[0][j] = j * COST.gap;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(
        d[i - 1][j - 1] + COST[kind(i - 1, j - 1)],
        d[i - 1][j] + COST.gap,
        d[i][j - 1] + COST.gap,
      );
    }
  }

  const ops = [];
  const EPS = 1e-9;
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const k = kind(i - 1, j - 1);
      if (Math.abs(d[i][j] - (d[i - 1][j - 1] + COST[k])) < EPS) {
        const op = isAccepted(k) ? 'match' : 'sub';
        ops.push({ op, kind: k, expected: expected[i - 1], given: given[j - 1] });
        i--; j--; continue;
      }
    }
    if (i > 0 && Math.abs(d[i][j] - (d[i - 1][j] + COST.gap)) < EPS) {
      ops.push({ op: 'missing', expected: expected[i - 1] });
      i--; continue;
    }
    if (j > 0 && Math.abs(d[i][j] - (d[i][j - 1] + COST.gap)) < EPS) {
      ops.push({ op: 'extra', given: given[j - 1] });
      j--; continue;
    }
    throw new Error('align: no traceback step');
  }
  return ops.reverse();
}

// Grade a full answer against the expected text.
export function gradeAnswer(expectedText, givenText) {
  const expected = tokenize(expectedText);
  const given = tokenize(givenText);
  const ops = align(expected, given);
  const counts = { exact: 0, close: 0, modern: 0, wrong: 0, missing: 0, extra: 0 };
  for (const o of ops) {
    if (o.op === 'match') counts[o.kind]++;
    else if (o.op === 'sub') counts[o.kind]++;
    else counts[o.op]++;
  }
  const errors = counts.modern + counts.wrong + counts.missing + counts.extra;
  return {
    correct: errors === 0 && expected.length > 0,
    ops,
    counts,
    score: expected.length ? (counts.exact + counts.close) / expected.length : 0,
  };
}

// The bare word as shown on a chip or in feedback: edge punctuation removed,
// case and inner apostrophes kept.
export function bareWord(display) {
  return String(display).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function modernMessage(expectedDisplay) {
  return `KJV has “${bareWord(expectedDisplay)}” here.`;
}
