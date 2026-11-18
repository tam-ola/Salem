import { registry } from './assert.js';
import './grading.test.js';
import './scheduler.test.js';
import './exercises.test.js';
import { reports } from './simulation.test.js';

const out = document.getElementById('results');
const h = (tag, text, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; n.textContent = text; return n; };

const results = [];
for (const t of registry) {
  const started = performance.now();
  try {
    await t.fn();
    results.push({ ...t, ok: true, ms: performance.now() - started });
  } catch (err) {
    results.push({ ...t, ok: false, error: err.message, ms: performance.now() - started });
    console.error(t.group, '—', t.name, err);
  }
}

const failed = results.filter((r) => !r.ok);
out.append(h('p', `${results.length - failed.length} passed, ${failed.length} failed`, failed.length ? 'summary bad' : 'summary good'));
let group = null;
for (const r of results) {
  if (r.group !== group) { group = r.group; out.append(h('h2', group)); }
  const line = h('div', `${r.ok ? 'pass' : 'FAIL'}  ${r.name}  (${r.ms.toFixed(0)} ms)`, r.ok ? 'pass' : 'fail');
  if (!r.ok) line.append(h('pre', r.error));
  out.append(line);
}

for (const rep of reports) {
  out.append(h('h3', rep.name));
  const table = document.createElement('table');
  const cols = ['days', 'maxDue', 'avgItems', 'newVerses', 'verses', 'held', 'oldestOverdue'];
  const heads = ['days', 'max due at start of day', 'items done / day', 'new verses', 'verses in rotation', 'held', 'oldest overdue (days)'];
  table.append(...[heads, ...rep.weekly.map((w) => cols.map((c) => w[c]))].map((row, i) => {
    const tr = document.createElement('tr');
    tr.append(...row.map((v) => h(i ? 'td' : 'th', String(v))));
    return tr;
  }));
  out.append(table);
}

window.__results = { results: results.map(({ fn, ...r }) => r), reports };
document.title = failed.length ? `FAIL (${failed.length})` : 'PASS';
