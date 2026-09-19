import test from 'node:test';
import assert from 'node:assert/strict';
import { place, unplace, EXTENT } from '../src/space.js';

test('place and unplace are inverses on the unit square', () => {
  for (const [u, v] of [[0, 0], [1, 1], [0.5, 0.5], [0.25, 0.8]]) {
    const [u2, v2] = unplace(place(u, v));
    assert.ok(Math.abs(u2 - u) < 1e-9 && Math.abs(v2 - v) < 1e-9);
  }
  assert.equal(place(1, 0).x - place(0, 0).x, EXTENT);
});
