// Today: the held count and one primary action. Deliberately plain (phase 1).

import { el } from './text.js';

export function renderToday(root, { held, learning, preview, canResume, extraAvailable, degraded, clockNote, path, onStart, onResume, onExtra, onPath }) {
  const main = el('main', { class: 'today' });
  main.append(el('p', { class: 'eyebrow' }, 'Verses held'), el('p', { class: 'held-count' }, String(held)));
  if (learning) main.append(el('p', { class: 'muted' }, `${learning} more ${learning === 1 ? 'verse is' : 'verses are'} on the way.`));

  let primary = null;
  if (canResume) {
    main.append(el('p', {}, 'You have a session in progress.'));
    primary = el('button', { class: 'primary', type: 'button', onclick: onResume }, 'Continue session');
  } else if (preview.kind === 'comeback') {
    main.append(el('h2', {}, 'Let’s see what stuck'), el('p', { class: 'muted' }, 'A short check-in of eight verses.'));
    primary = el('button', { class: 'primary', type: 'button', onclick: onStart }, 'Start check-in');
  } else if (preview.items.length) {
    const n = preview.items.length;
    main.append(el('p', {}, `Today’s session: ${n} ${n === 1 ? 'item' : 'items'}, about ${Math.max(1, Math.round(n / 3))} min.`));
    primary = el('button', { class: 'primary', type: 'button', onclick: onStart }, 'Start session');
  } else {
    main.append(el('p', {}, 'Nothing is due right now. Your verses are resting.'));
  }

  if (extraAvailable && !canResume && preview.items.length < 4) {
    main.append(el('button', { class: 'secondary', type: 'button', onclick: onExtra }, 'Extra practice'));
  }

  const select = el('select', { id: 'path', onchange: (e) => onPath(e.target.value) },
    el('option', { value: 'starter', selected: path === 'starter' }, 'Your path (default)'),
    el('option', { value: 'classic', selected: path === 'classic' }, 'Classic path'));
  main.append(el('details', { class: 'settings' }, el('summary', {}, 'Settings'),
    el('label', { for: 'path' }, 'Starting verses '), select));

  if (degraded) {
    main.append(el('p', { class: 'warning', role: 'status' },
      'Storage is unavailable in this browser, so progress will be lost when this tab closes.'));
  }
  if (clockNote) main.append(el('p', { class: 'muted' }, clockNote));

  root.replaceChildren(main, el('footer', { class: 'action-bar' }, primary ?? el('span')));
}
