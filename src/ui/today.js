// Home: the held count, what today holds, the streak and the garden, and one
// main action. No overdue counts anywhere (SPEC.md §4.6, §11).

import { el } from './text.js';
import * as icons from './icons.js';
import { STAGES } from '../progress.js';

const GARDEN_MAX = 24;

function greeting(t) {
  const h = new Date(t).getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function renderToday(root, props) {
  const { now, held, plants, streak, plan, canResume, extraAvailable, degraded, clockNote, onStart, onResume, onExtra, onSettings } = props;

  const header = el('div', { class: 'row2' },
    el('h1', { class: 'display greet' }, greeting(now)),
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Settings', onclick: onSettings }, icons.gear()));

  const heldBlock = el('div', { class: 'held' }, el('b', {}, String(held)),
    el('span', { class: 'muted' }, held === 1 ? 'verse held' : 'verses held', el('br'), 'for 30 days or more'));

  // Today
  let primary;
  let todayCard;
  if (canResume) {
    todayCard = card('Today', el('p', {}, 'You are part way through a session. Pick up where you left off.'));
    primary = { label: 'Continue session', onclick: onResume };
  } else if (plan.kind === 'comeback') {
    todayCard = card('Welcome back', el('h2', { class: 'display sm' }, 'Let’s see what stuck'), el('p', { class: 'muted' }, 'A quick check-in of eight verses. Whatever you still know goes straight back to a long interval.'));
    primary = { label: 'Start check-in', onclick: onStart };
  } else if (plan.steps.length) {
    const rows = [];
    for (const ref of plan.newRefs) rows.push(row('New verse', el('b', { class: 'serif' }, ref)));
    if (plan.practice) rows.push(row('Practice', el('b', {}, `${plan.practice} verse${plan.practice > 1 ? 's' : ''}`)));
    const minutes = Math.max(2, Math.round(plan.steps.length / 3));
    rows.push(el('div', { class: 'row2 muted small' }, el('span', {}, `About ${minutes} minutes`), el('span', {}, `${plan.steps.length} steps`)));
    todayCard = card('Today', el('div', { class: 'today-list' }, ...rows));
    primary = { label: streak.wateredToday ? 'Start another session' : 'Start today’s session', onclick: onStart };
  } else {
    todayCard = card('Today', el('p', {}, streak.wateredToday ? 'Your garden is watered for today. Everything is resting.' : 'Nothing needs watering right now. Your verses are resting.'));
    primary = extraAvailable ? { label: 'Practise held verses', onclick: onExtra } : null;
  }

  // Streak
  const days = el('div', { class: 'week' }, ...streak.week.map((d) => {
    const label = new Date(d.key.replace(/-/g, '/')).toLocaleDateString(undefined, { weekday: 'narrow' });
    return el('span', { class: `day ${d.state}`, title: d.state === 'rest' ? 'Rest day' : d.state === 'watered' ? 'Watered' : '' }, icons.drop(18), label);
  }));
  const streakCard = card(null,
    el('div', { class: 'row2' }, el('span', { class: 'eyebrow' }, 'Watering'),
      el('span', { class: 'mini' }, icons.drop(14), streak.days === 0 ? 'Starts today' : streak.days === 1 ? '1 day' : `${streak.days} days`)),
    days,
    el('p', { class: 'muted small' }, `${streak.restLeft} rest day${streak.restLeft === 1 ? '' : 's'} in reserve. A missed day uses one, automatically.`));

  // Garden
  const shown = plants.slice(0, GARDEN_MAX);
  const garden = shown.length
    ? el('div', { class: 'garden' }, ...shown.map((p) => el('figure', { title: `${p.ref}: ${STAGES[p.stage]}` }, icons.plant(p.stage, 34), el('figcaption', {}, p.short))))
    : el('p', { class: 'muted' }, 'Your first seeds go in today.');
  const gardenCard = card(null,
    el('div', { class: 'row2' }, el('span', { class: 'eyebrow' }, 'Your garden'), plants.length ? el('span', { class: 'muted small' }, `${plants.length} verse${plants.length > 1 ? 's' : ''}`) : null),
    garden,
    plants.length > GARDEN_MAX ? el('p', { class: 'muted small' }, `and ${plants.length - GARDEN_MAX} more`) : null,
    el('p', { class: 'legend muted small' }, ...STAGES.map((s, i) => el('span', {}, icons.plant(i, 18), s))));

  const main = el('main', { class: 'scroll home' }, header, heldBlock, todayCard, streakCard, gardenCard);
  if (degraded) main.append(el('p', { class: 'warning', role: 'status' }, 'This browser is not letting the app save, so progress will be lost when the tab closes. A private window is the usual cause.'));
  if (clockNote) main.append(el('p', { class: 'muted small center' }, clockNote));

  const button = primary ? el('button', { class: 'btn', type: 'button', onclick: primary.onclick }, primary.label) : el('button', { class: 'btn', type: 'button', disabled: true }, 'All done for now');
  root.replaceChildren(el('div', { class: 'screen' }, main, el('footer', { class: 'actions' }, el('div', { class: 'helpers hidden' }), button)));
}

function card(title, ...children) {
  return el('section', { class: 'card' }, title ? el('span', { class: 'eyebrow' }, title) : null, ...children);
}
const row = (label, value) => el('div', { class: 'row2' }, el('span', {}, label), value);
