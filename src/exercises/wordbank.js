// Word bank: tap word chips to assemble the verse in order (SPEC.md §5, tier 1).
// Verses over 25 words are worked chunk by chunk.

import { tokenize, bareWord, gradeAnswer } from '../grading.js';
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
    // Never present the chips already in the right order.
    if (chips.length > 2 && chips.slice(0, words.length).every((c, i) => !c.decoy && c.label === words[i].label)) {
      chips = [...chips.slice(1), chips[0]];
    }
    return { text, wordCount: tokens.length, chips: chips.map((c, i) => ({ ...c, key: i })) };
  });
}

export function mount(container, { verse, library, seed, onReady }) {
  const segments = buildWordBank(verse, library, seed);
  let index = 0;
  let placed = []; // chip keys in answer order
  let checked = false;
  let allCorrect = true;

  const answerLine = el('div', { class: 'answer-line verse', 'aria-live': 'polite' });
  const bank = el('div', { class: 'bank' });
  const status = el('p', { class: 'step-status' });
  const feedback = el('div');
  container.replaceChildren(status, answerLine, feedback, bank);

  const seg = () => segments[index];

  function draw() {
    const s = seg();
    status.textContent = segments.length > 1 ? `Part ${index + 1} of ${segments.length}` : '';
    answerLine.replaceChildren(
      ...(placed.length
        ? placed.map((key) => el('button', {
            class: 'chip placed', type: 'button', disabled: checked,
            onclick: () => { placed = placed.filter((k) => k !== key); draw(); },
          }, verseText(s.chips[key].label)))
        : [el('span', { class: 'placeholder' }, 'Tap the words in order')]),
    );
    bank.replaceChildren(...s.chips.map((c) => el('button', {
      class: 'chip', type: 'button',
      disabled: checked || placed.includes(c.key),
      onclick: () => { placed = [...placed, c.key]; draw(); },
    }, verseText(c.label))));
    onReady(!checked && placed.length === s.wordCount);
  }

  draw();

  return {
    // Grade the current part. `final` says whether the whole item is done.
    check() {
      const s = seg();
      const given = placed.map((k) => s.chips[k].label).join(' ');
      const result = gradeAnswer(s.text, given);
      checked = true;
      allCorrect = allCorrect && result.correct;
      feedback.replaceChildren(result.correct
        ? el('p', { class: 'result ok' }, 'Correct')
        : el('div', {}, el('p', { class: 'result wrong' }, 'Not quite. Here is the verse:'), renderDiff(result)));
      draw();
      return { final: index === segments.length - 1, correct: allCorrect };
    },
    // Move to the next part. Returns false when the item is finished.
    next() {
      if (index >= segments.length - 1) return false;
      index++;
      placed = [];
      checked = false;
      feedback.replaceChildren();
      draw();
      return true;
    },
  };
}
