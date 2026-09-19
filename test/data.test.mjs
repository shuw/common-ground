import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const corpus = JSON.parse(readFileSync('public/data/corpus.json', 'utf8'));

test('the corpus has every text, and each verse names its text and a reference', () => {
  const ids = Object.keys(corpus.texts);
  assert.equal(ids.length, 7);
  for (const v of corpus.verses) {
    assert.ok(ids.includes(v[0]) && typeof v[1] === 'string' && v[2].length > 0, v[1]);
  }
  const count = (t) => corpus.verses.filter(v => v[0] === t).length;
  assert.equal(count('torah'), 23145); assert.equal(count('gospels'), 3779); assert.equal(count('quran'), 6236);
  assert.ok(count('analects') > 450 && count('dhamma') > 400 && count('tao') > 150 && count('gita') > 250);
  for (const t of Object.values(corpus.texts)) assert.ok(t.translation && t.source && t.licence && t.colour);
});

test('each text lists its books in reading order, and they account for every verse', () => {
  for (const [id, t] of Object.entries(corpus.texts)) {
    assert.equal(t.books.reduce((s, [, n]) => s + n, 0), t.verses, id);
    for (const [name, n] of t.books) assert.ok(name && n > 0, `${id} ${name}`);
  }
  assert.equal(corpus.texts.torah.books.length, 39); assert.equal(corpus.texts.gospels.books.length, 4);
  assert.equal(corpus.texts.quran.books.length, 114); assert.equal(corpus.texts.dhamma.books.length, 26);
  assert.equal(corpus.texts.gita.books.length, 18); assert.equal(corpus.texts.tao.books.length, 81); assert.equal(corpus.texts.analects.books.length, 20);
});

test('the layout, when present, has one place per verse', { skip: !existsSync('public/data/layout.json') }, () => {
  const layout = JSON.parse(readFileSync('public/data/layout.json', 'utf8'));
  assert.equal(layout.uv.length, corpus.verses.length);
  assert.equal(layout.height.length, corpus.verses.length);
  assert.equal(layout.density.values.length, layout.density.size ** 2);
  for (const [u, v] of layout.uv) assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1);
});
