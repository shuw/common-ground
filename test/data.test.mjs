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
  assert.ok(count('analects') > 450 && count('dhamma') > 400 && count('tao') > 200 && count('gita') > 230);
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

test('the kin table and the regions, when present, cover every verse', { skip: !existsSync('public/data/kin.bin') || !existsSync('public/data/regions.json') }, () => {
  const N = corpus.verses.length, texts = Object.keys(corpus.texts);
  const kin = readFileSync('public/data/kin.bin');
  assert.equal(kin.length, N * 7 * 3, 'seven uint16 indices and seven uint8 similarities per verse');
  const idx = new Uint16Array(kin.buffer, kin.byteOffset, N * 7);
  for (let i = 0; i < N; i += 997) for (let k = 0; k < 7; k++) {
    assert.ok(idx[i * 7 + k] < N);
    assert.equal(corpus.verses[idx[i * 7 + k]][0], texts[k], 'kin lives in the text of its column');
    if (corpus.verses[i][0] !== texts[k]) assert.notEqual(idx[i * 7 + k], i);
  }
  const regions = JSON.parse(readFileSync('public/data/regions.json', 'utf8'));
  assert.equal(regions.label.length, N);
  assert.equal(regions.regions.length, regions.k);
  for (const r of regions.regions) { assert.ok(r.name, `region ${r.id} is named`); assert.ok(r.u >= 0 && r.u <= 1 && r.v >= 0 && r.v <= 1); assert.equal(Object.values(r.share).reduce((a, b) => a + b, 0), r.n); }
});
