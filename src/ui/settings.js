// Settings: text size first, because it matters most (SPEC.md §12).

import { el, verseText } from './text.js';
import * as icons from './icons.js';

export const TEXT_SCALES = [['Small', 0.95], ['Medium', 1], ['Large', 1.15], ['Extra large', 1.3]];

export function renderSettings(root, { settings, sample, degraded, onChange, onIntro, onBack }) {
  const group = (title, name, options, value) => el('fieldset', { class: 'card' },
    el('legend', { class: 'eyebrow' }, title),
    el('div', { class: 'segmented' }, ...options.map(([label, v]) => el('button', {
      type: 'button', class: v === value ? 'on' : '', 'aria-pressed': String(v === value),
      onclick: () => onChange(name, v),
    }, label))));

  const main = el('main', { class: 'scroll' },
    el('div', { class: 'row2' }, el('h1', { class: 'display' }, 'Settings'),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', onclick: onBack }, icons.close())),
    group('Text size', 'textScale', TEXT_SCALES, settings.textScale),
    sample ? el('p', { class: 'verse sample' }, verseText(sample)) : null,
    group('Appearance', 'theme', [['Match device', 'system'], ['Day', 'light'], ['Night', 'dark']], settings.theme),
    group('New verses come from', 'path', [['Your verses', 'starter'], ['Classic verses', 'classic']], settings.path),
    el('button', { class: 'ghost', type: 'button', onclick: onIntro }, 'See the introduction again'),
    el('p', { class: 'muted small' }, degraded
      ? 'This browser is not letting the app save. Progress lasts only until the tab closes.'
      : 'Your progress is saved in this browser on this device only.'));
  root.replaceChildren(el('div', { class: 'screen' }, main, el('footer', { class: 'actions' }, el('div', { class: 'helpers hidden' }), el('button', { class: 'btn', type: 'button', onclick: onBack }, 'Done'))));
}
