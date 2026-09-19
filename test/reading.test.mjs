import test from 'node:test';
import assert from 'node:assert/strict';
import { readingLayout } from '../src/layers/verses.js';

const corpus = {
  texts: { a: { verses: 5, colour: '#fff' }, b: { verses: 3, colour: '#000' } },
  verses: [['a'], ['a'], ['b'], ['a'], ['b'], ['a'], ['b'], ['a']],
};

test('reading order runs left to right inside each band, bands do not overlap', () => {
  const { uv, bands } = readingLayout(corpus);
  assert.equal(uv.length, corpus.verses.length);
  for (const k of ['a', 'b']) {
    const us = corpus.verses.map((v, i) => (v[0] === k ? uv[i] : null)).filter(Boolean);
    for (let i = 1; i < us.length; i++) assert.ok(us[i][0] > us[i - 1][0], `${k} verse ${i} left of the one before`);
    for (const [, v] of us) assert.ok(v >= bands[k].top && v <= bands[k].top + bands[k].height, `${k} verse inside its band`);
  }
  assert.ok(bands.b.top >= bands.a.top + bands.a.height);
  for (const [u, v] of uv) assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1);
});
