// DOM helpers and verse rendering. The KJV sets the divine name LORD (and
// GOD, JEHOVAH) as a capital with small capitals. The text is rendered in
// Playfair Display SC as "Lord", which gives exactly that, and stays visibly
// different from the ordinary word "Lord".

const DIVINE = /\b(LORD|GOD|JEHOVAH)\b/g;
const SMALL_CAPS = { LORD: 'Lord', GOD: 'God', JEHOVAH: 'Jehovah' };

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function verseText(text) {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of String(text).matchAll(DIVINE)) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    frag.append(el('span', { class: 'divine-name' }, SMALL_CAPS[m[0]]));
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}
