// The shape of the Bible: 66 book names in canonical order, grouped into the
// sections people learn them by. Names only; no verse text lives here.

export const SECTIONS = [
  { name: 'Law', testament: 'Old Testament', books: ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'] },
  { name: 'History', testament: 'Old Testament', books: ['Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther'] },
  { name: 'Poetry', testament: 'Old Testament', books: ['Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon'] },
  { name: 'Major prophets', testament: 'Old Testament', books: ['Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel'] },
  { name: 'Minor prophets', testament: 'Old Testament', books: ['Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi'] },
  { name: 'Gospels', testament: 'New Testament', books: ['Matthew', 'Mark', 'Luke', 'John'] },
  { name: 'Acts', testament: 'New Testament', books: ['Acts'] },
  { name: 'Letters', testament: 'New Testament', books: ['Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude'] },
  { name: 'Revelation', testament: 'New Testament', books: ['Revelation'] },
];

export const BOOKS = SECTIONS.flatMap((s) => s.books);

export const bookIndex = (name) => BOOKS.indexOf(name);

export function sectionIndexOf(book) {
  return SECTIONS.findIndex((s) => s.books.includes(book));
}

// "Old Testament · Poetry · Psalms, book 19 of 66"
export function locate(book) {
  const si = sectionIndexOf(book);
  if (si === -1) return null;
  return { section: SECTIONS[si], sectionIndex: si, bookNumber: bookIndex(book) + 1 };
}
