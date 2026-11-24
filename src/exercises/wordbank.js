// Word bank: tap word chips to assemble the verse in order (SPEC.md §5).
// Verses over 25 words are worked chunk by chunk. A hint places the next
// correct word; "I don't know it yet" shows the verse.

import { tokenize, bareWord, normalizeWord, gradeAnswer } from '../grading.js';
import { seededRandom, shuffle } from '../scheduler.js';
import { pickDecoys, decoyCount } from './decoys.js';
import { el, verseText } from '../ui/text.js';
import { renderDiff } from '../ui/feedback.js';

export const CHUNK_ABOVE_WORDS = 25;

// Pure: the segments and chips for one presentation of a verse.
export function buildWordBank(verse, library, seed) {
  const rand = seededRandom(`wordbank:${seed}`);
  const texts = verse.word_count > CHUNK_ABOVE_WORDS && verse.chunks.length > 1 ? verse.chunks : [verse.text];
  return texts.map((text) => {
    const tokens = tokenize(text);
    const words = tokens.map((t) => ({ label: bareWord(t.display), decoy: false }));
    const decoys = pickDecoys(verse, library, tokens.map((t) => t.norm), decoyCount(tokens.length), rand)
      .map((label) => ({ label, decoy: true }));
    let chips = shuffle([...words, ...decoys], rand);
    if (chips.length > 2 && chips.slice(0, words.length).every((c, i) => !c.decoy && c.label === words[i].label)) {
      chips = [...chips.slice(1), chips[0]];
    }
    return { text, wordCount: tokens.length, answer: tokens.map((t) => t.norm), labels: words.map((w) => w.label), chips: chips.map((c, i) => ({ ...c, key: i })) };
  });
}

export function mount(container, { verse, library, seed, onReady }) {
  const segments = buildWordBank(verse, library, seed);
  let index = 0;
  let placed = [];
  let hinted = new Set();
  let checked = false;
  let marks = null; // per placed position: true right, false wrong
  let allCorrect = true;
  let hints = 0;

  const count = el('span', { class: 'muted small' });
  const status = el('span', { class: 'eyebrow' });
  const answerLine = el('div', { class: 'answer verse', 'aria-live': 'polite' });
  const bank = el('div', { class: 'bank' });
  container.replaceChildren(el('div', { class: 'row2' }, status, count), el('h2', { class: 'ref ref-sm' }, verse.reference), answerLine, bank);

  const seg = () => segments[index];
  const wordOf = (key) => normalizeWord(seg().chips[key].label);

  function draw() {
    const s = seg();
    status.textContent = segments.length > 1 ? `Build the verse · part ${index + 1} of ${segments.length}` : 'Build the verse';
    count.textContent = `${placed.length}/${s.wordCount} words`;
    answerLine.replaceChildren(...(placed.length
      ? placed.map((key, i) => el('button', {
          class: `chip in ${hinted.has(i) ? 'hinted' : ''} ${marks ? (marks[i] ? 'good' : 'bad') : ''}`,
          type: 'button', disabled: checked, 'aria-label': `Remove ${s.chips[key].label}`,
          onclick: () => { placed = placed.filter((_, j) => j !== i); hinted = new Set([...hinted].filter((h) => h < i)); draw(); },
        }, verseText(s.chips[key].label)))
      : [el('span', { class: 'placeholder' }, 'Tap the words in order')]));
    bank.replaceChildren(...s.chips.map((c) => el('button', {
      class: 'chip', type: 'button', disabled: checked || placed.includes(c.key),
      onclick: () => { placed = [...placed, c.key]; draw(); },
    }, verseText(c.label))));
    onReady(!checked && placed.length === s.wordCount);
  }
  draw();

  const fullVerse = () => el('p', { class: 'verse' }, verseText(verse.text));

  return {
    get hints() { return hints; },
    get wordCount() { return segments.reduce((n, s) => n + s.wordCount, 0); },
    hint() {
      if (checked) return;
      const s = seg();
      const firstWrong = placed.findIndex((key, i) => wordOf(key) !== s.answer[i]);
      if (firstWrong !== -1) { placed = placed.slice(0, firstWrong); hinted = new Set([...hinted].filter((h) => h < firstWrong)); }
      const i = placed.length;
      if (i >= s.wordCount) return;
      const open = s.chips.filter((c) => !c.decoy && !placed.includes(c.key) && wordOf(c.key) === s.answer[i]);
      const chip = open.find((c) => c.label === s.labels[i]) ?? open[0];
      placed = [...placed, chip.key];
      hinted.add(i);
      hints++;
      draw();
    },
    giveUp() {
      checked = true;
      allCorrect = false;
      index = segments.length - 1;
      bank.replaceChildren();
      return { final: true, correct: false, sheet: { kind: 'info', title: 'Here it is', body: el('div', {}, fullVerse(), el('p', {}, 'Read it through once. It will come back later in this session.')) } };
    },
    check() {
      const s = seg();
      const result = gradeAnswer(s.text, placed.map((k) => s.chips[k].label).join(' '));
      marks = placed.map((key, i) => wordOf(key) === s.answer[i]);
      checked = true;
      allCorrect = allCorrect && result.correct;
      draw();
      const final = index === segments.length - 1;
      if (result.correct) {
        const title = hints ? 'You got there' : 'Word perfect';
        const body = hints ? `With ${hints} hint${hints > 1 ? 's' : ''}. Next time, try with fewer.` : final ? 'No hints needed.' : 'On to the next part.';
        return { final, correct: allCorrect, sheet: { kind: 'ok', title, body } };
      }
      return { final, correct: allCorrect, sheet: { kind: 'bad', title: 'Nearly', body: renderDiff(result) } };
    },
    next() {
      if (index >= segments.length - 1) return false;
      index++; placed = []; hinted = new Set(); checked = false; marks = null;
      draw();
      return true;
    },
  };
}
