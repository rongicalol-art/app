const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'chars.js');
const OUTPUT_ROOT = path.join(ROOT, 'data', 'chars');
const CHUNKS_DIR = path.join(OUTPUT_ROOT, 'chunks');
const CHUNK_SIZE = 64;

global.window = global;
require(SOURCE);

const source = global.CHARS_DATA || {};
const chars = Object.keys(source).sort((a, b) => a.localeCompare(b, 'zh-Hant'));

const sanitizeDef = value => {
  if (value == null) return '';
  const text = String(value).trim();
  return text && text.toLowerCase() !== 'undefined' ? text : '';
};

const walkTree = (node, visitor, visited = new Set()) => {
  if (!node || typeof node !== 'object' || visited.has(node)) return;
  visited.add(node);
  visitor(node);
  if (Array.isArray(node.children)) {
    node.children.forEach(child => walkTree(child, visitor, visited));
  }
};

fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
fs.mkdirSync(CHUNKS_DIR, { recursive: true });

const meta = {};
const chunkMap = {};
const componentIndex = {};
const fallbackTreeIndex = {};

chars.forEach((char, index) => {
  const entry = source[char] || {};
  const chunkId = `chunk-${String(Math.floor(index / CHUNK_SIZE)).padStart(3, '0')}.json`;

  chunkMap[char] = chunkId;
  meta[char] = {
    hanzi: char,
    pinyin: Array.isArray(entry.pinyin) ? entry.pinyin : (entry.pinyin ? [entry.pinyin] : []),
    def: sanitizeDef(entry.meaning || entry.definition),
    meaning: sanitizeDef(entry.meaning || entry.definition),
    chameleon_alert: entry.chameleon_alert || null,
    phonetic_clue: entry.phonetic_clue || null,
    street_utility: entry.street_utility || null
  };

  if (entry.deconstruction_tree) {
    const components = new Set();
    walkTree(entry.deconstruction_tree, node => {
      if (!node.component) return;
      if (!fallbackTreeIndex[node.component]) {
        fallbackTreeIndex[node.component] = node;
      }
      components.add(node.component);
    });

    components.forEach(component => {
      if (component === char) return;
      if (!componentIndex[component]) componentIndex[component] = [];
      componentIndex[component].push(char);
    });
  }
});

for (let start = 0; start < chars.length; start += CHUNK_SIZE) {
  const chunkChars = chars.slice(start, start + CHUNK_SIZE);
  const payload = {};
  chunkChars.forEach(char => {
    payload[char] = source[char];
  });
  const chunkId = `chunk-${String(Math.floor(start / CHUNK_SIZE)).padStart(3, '0')}.json`;
  fs.writeFileSync(path.join(CHUNKS_DIR, chunkId), JSON.stringify(payload));
}

fs.writeFileSync(path.join(OUTPUT_ROOT, 'meta.json'), JSON.stringify(meta));
fs.writeFileSync(path.join(OUTPUT_ROOT, 'chunk-map.json'), JSON.stringify(chunkMap));
fs.writeFileSync(path.join(OUTPUT_ROOT, 'component-index.json'), JSON.stringify(componentIndex));
fs.writeFileSync(path.join(OUTPUT_ROOT, 'fallback-tree-index.json'), JSON.stringify(fallbackTreeIndex));

const stat = file => fs.statSync(path.join(OUTPUT_ROOT, file)).size;
console.log(JSON.stringify({
  chars: chars.length,
  chunks: Math.ceil(chars.length / CHUNK_SIZE),
  metaBytes: stat('meta.json'),
  chunkMapBytes: stat('chunk-map.json'),
  componentIndexBytes: stat('component-index.json'),
  fallbackTreeIndexBytes: stat('fallback-tree-index.json')
}, null, 2));
