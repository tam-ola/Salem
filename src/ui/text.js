// Rendering verse words. LORD and GOD (the divine name) are wrapped so CSS
// can set them in small capitals; they stay distinct from "Lord" on screen.

const DIVINE = /\b(LORD|GOD|JEHOVAH)\b/g;

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'style') node.setAttribute('style', v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// A string of verse text -> fragment, with the divine name marked up.
export function verseText(text) {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(DIVINE)) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    frag.append(el('span', { class: 'divine-name' }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}
