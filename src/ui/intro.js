// The three-screen introduction, shown once on first visit.

import { el } from './text.js';
import * as icons from './icons.js';

export function renderIntro(root, { path, firsts, onFinish, onSkip }) {
  let page = 0;
  let choice = path;

  const dots = () => el('div', { class: 'dots', 'aria-hidden': 'true' }, ...[0, 1, 2].map((i) => el('i', { class: i === page ? 'on' : '' })));

  function draw() {
    let content;
    let label;
    let secondary = null;
    if (page === 0) {
      content = el('div', { class: 'intro-hero' }, icons.plant(3, 132), el('h1', { class: 'wordmark' }, 'Verses'),
        el('p', { class: 'muted intro-lead' }, 'Learn the King James Bible by heart, a few minutes a day.'));
      label = 'Get started';
      secondary = el('button', { class: 'ghost plain', type: 'button', onclick: onSkip }, 'Skip the introduction');
    } else if (page === 1) {
      const item = (icon, title, text) => el('div', {}, el('span', { class: 'ic' }, icon), el('div', {}, el('h3', {}, title), el('p', {}, text)));
      content = el('div', { class: 'stack' },
        el('span', { class: 'eyebrow' }, 'How it works'),
        el('h1', { class: 'display' }, 'Short sessions. Verses that stay.'),
        el('div', { class: 'steps3' },
          item(icons.eye(), 'Meet a verse', 'Read it phrase by phrase, see what it means and where it sits in the Bible.'),
          item(icons.puzzle(), 'Build it', 'Put the words back together. Stuck? Take a hint, or say you don’t know it yet.'),
          item(icons.plant(2, 30), 'Watch it grow', 'Each verse comes back just before you would forget it, and grows from seed to flower.')),
        el('p', { class: 'muted small' }, 'At most two new verses a day, so it never piles up.'));
      label = 'Next';
    } else {
      const option = (id, title, text, extra) => el('button', {
        class: `path ${choice === id ? 'sel' : ''}`, type: 'button', 'aria-pressed': String(choice === id),
        onclick: () => { choice = id; draw(); },
      }, el('b', {}, title), el('span', {}, text), el('em', {}, extra));
      content = el('div', { class: 'stack' },
        el('span', { class: 'eyebrow' }, 'Your first verses'),
        el('h1', { class: 'display' }, 'Where would you like to start?'),
        el('div', { class: 'paths' },
          option('starter', 'Your verses', '20 short verses chosen from your own lists.', `Starts with ${firsts.starter}`),
          option('classic', 'Classic verses', '20 verses from popular memorization lists.', `Starts with ${firsts.classic}`)),
        el('p', { class: 'muted small' }, 'You can change this later in settings.'));
      label = 'Start my first session';
    }
    const primary = el('button', { class: 'btn', type: 'button', onclick: () => (page < 2 ? (page++, draw()) : onFinish(choice)) }, label);
    root.replaceChildren(el('div', { class: 'screen' },
      el('main', { class: 'scroll intro' }, content, dots()),
      el('footer', { class: 'actions' }, el('div', { class: `helpers ${secondary ? '' : 'hidden'}` }, secondary), primary)));
  }
  draw();
}
