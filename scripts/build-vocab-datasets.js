const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'new_vocab.js');
const OUTPUT_ROOT = path.join(ROOT, 'data', 'vocab');
const BOOKS_DIR = path.join(OUTPUT_ROOT, 'books');

global.window = global;
require(SOURCE);

const source = Array.isArray(global.new_vocab) ? global.new_vocab : [];

const sanitizeDef = value => {
  if (value == null) return '';
  const text = String(value).trim();
  return text && text.toLowerCase() !== 'undefined' ? text : '';
};

const normalizeBook = value => String(value || '1').replace(/^[a-z]+/i, '') || '1';
const normalizeLesson = value => String(Number.parseInt(String(value || '0'), 10) || 0);
const normalizeDialogue = value => String(Number.parseInt(String(value || '0'), 10) || 0);

fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
fs.mkdirSync(BOOKS_DIR, { recursive: true });

const catalog = {
  books: [],
  lessonsByBook: {},
  dialoguesByBookLesson: {}
};

const itemsByBook = new Map();
const seen = new Set();

source.forEach(entry => {
  const hanzi = entry.word || entry.hanzi;
  if (!hanzi) return;

  const book = normalizeBook(entry.book_id);
  const lesson = normalizeLesson(entry.lesson_id);
  const dialogue = normalizeDialogue(entry.dialogue_id);
  const id = entry.id || `${book}-${lesson}-${hanzi}`;
  if (seen.has(id)) return;
  seen.add(id);

  const normalized = {
    ...entry,
    id,
    hanzi,
    pinyin: typeof entry.pinyin === 'string' ? entry.pinyin.trim() : '',
    def: sanitizeDef(entry.definition ?? entry.def ?? ''),
    lesson,
    book,
    dialogue
  };

  if (!itemsByBook.has(book)) itemsByBook.set(book, []);
  itemsByBook.get(book).push(normalized);

  if (!catalog.lessonsByBook[book]) catalog.lessonsByBook[book] = new Set();
  catalog.lessonsByBook[book].add(lesson);

  const lessonKey = `${book}-${lesson}`;
  if (!catalog.dialoguesByBookLesson[lessonKey]) catalog.dialoguesByBookLesson[lessonKey] = new Set();
  if (dialogue !== '0') catalog.dialoguesByBookLesson[lessonKey].add(dialogue);
});

catalog.books = [...itemsByBook.keys()].sort((a, b) => Number(a) - Number(b));

catalog.books.forEach(book => {
  const items = itemsByBook.get(book) || [];
  fs.writeFileSync(
    path.join(BOOKS_DIR, `book-${book}.json`),
    JSON.stringify(items)
  );
});

Object.keys(catalog.lessonsByBook).forEach(book => {
  catalog.lessonsByBook[book] = [...catalog.lessonsByBook[book]].sort((a, b) => Number(a) - Number(b));
});

Object.keys(catalog.dialoguesByBookLesson).forEach(key => {
  catalog.dialoguesByBookLesson[key] = [...catalog.dialoguesByBookLesson[key]].sort((a, b) => Number(a) - Number(b));
});

fs.writeFileSync(path.join(OUTPUT_ROOT, 'catalog.json'), JSON.stringify(catalog));

const totalBytes = catalog.books.reduce((sum, book) => (
  sum + fs.statSync(path.join(BOOKS_DIR, `book-${book}.json`)).size
), 0);

console.log(JSON.stringify({
  books: catalog.books.length,
  items: seen.size,
  catalogBytes: fs.statSync(path.join(OUTPUT_ROOT, 'catalog.json')).size,
  bookBytes: totalBytes
}, null, 2));
