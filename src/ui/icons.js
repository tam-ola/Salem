// Inline SVG icons. Colours come from CSS custom properties.

const svg = (w, h, vb, body, cls = '') => {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="icon ${cls}" width="${w}" height="${h}" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
  return t.content.firstChild;
};

// Growth stages: 0 planted, 1 rooted, 2 growing, 3 held.
const PLANT = [
  '<ellipse cx="18" cy="31" rx="3.4" ry="2.4" class="seed"/>',
  '<path d="M18 33V24" class="stem"/><path d="M18 26c-3.5 0-5.5-2-5.5-5 3.4 0 5.5 2 5.5 5z" class="leaf"/>',
  '<path d="M18 33V15" class="stem"/><path d="M18 27c-4 0-6-2.3-6-5.5 3.8 0 6 2.3 6 5.5zM18 21c4 0 6-2.3 6-5.5-3.8 0-6 2.3-6 5.5z" class="leaf"/>',
  '<path d="M18 33V12" class="stem"/><path d="M18 28c-4 0-6-2.3-6-5.5 3.8 0 6 2.3 6 5.5zM18 22c4 0 6-2.3 6-5.5-3.8 0-6 2.3-6 5.5z" class="leaf"/><circle cx="18" cy="8.5" r="4" class="bloom"/><circle cx="18" cy="8.5" r="1.6" class="bloom-eye"/>',
];
export const plant = (stage, size = 34) => svg(size, size, '0 0 36 36', `<path d="M6 34h24" class="soil"/>${PLANT[stage]}`, 'plant');

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
export const drop = (size = 16, cls = '') => svg(size * 0.86, size, '0 0 12 14', '<path d="M6 1c2.6 3.4 4 5.6 4 7.6A4 4 0 0 1 2 8.6C2 6.6 3.4 4.4 6 1z" fill="currentColor"/>', cls);
export const bulb = (size = 18) => svg(size, size, '0 0 24 24', `<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" ${STROKE}/>`);
export const pin = (size = 18) => svg(size, size, '0 0 24 24', `<path d="M12 21s-6.5-6.1-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.9-6.5 11-6.5 11z" ${STROKE}/><circle cx="12" cy="10" r="2.4" fill="currentColor"/>`);
export const eye = (size = 22) => svg(size, size, '0 0 24 24', `<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" ${STROKE}/><circle cx="12" cy="12" r="3" fill="currentColor"/>`);
export const puzzle = (size = 22) => svg(size, size, '0 0 24 24', `<rect x="3" y="5" width="8" height="5" rx="1.5" ${STROKE}/><rect x="13" y="5" width="8" height="5" rx="1.5" ${STROKE}/><rect x="6" y="14" width="12" height="5" rx="1.5" fill="currentColor"/>`);
export const gear = (size = 22) => svg(size, size, '0 0 24 24', `<circle cx="12" cy="12" r="3.2" ${STROKE}/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" ${STROKE}/>`);
export const close = (size = 22) => svg(size, size, '0 0 24 24', `<path d="M6 6l12 12M18 6L6 18" ${STROKE}/>`);
