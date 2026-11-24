// Test fixtures are always drawn from data/library.json. Tests never contain
// verse text of their own; they derive variations from the library.
let cached = null;
export async function loadLibrary() {
  if (!cached) cached = await (await fetch('../data/library.json')).json();
  return cached;
}
export const findVerse = (lib, pred, what) => {
  const v = lib.verses.find(pred);
  if (!v) throw new Error(`fixture: no verse found for ${what}`);
  return v;
};
export const words = (text) => text.split(/\s+/).filter(Boolean);
