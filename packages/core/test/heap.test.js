import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MinHeap } from '../src/routing/heap.js';
import { seededRandom } from './helpers/random.js';

const numeric = (a, b) => a - b;

describe('MinHeap', () => {
  it('returns undefined when empty', () => {
    const heap = new MinHeap(numeric);
    assert.equal(heap.size, 0);
    assert.equal(heap.pop(), undefined);
    assert.equal(heap.peek(), undefined);
  });

  it('pops items in ascending order', () => {
    const heap = new MinHeap(numeric);
    [5, 3, 8, 1, 9, 2, 7].forEach((n) => heap.push(n));
    assert.equal(heap.size, 7);
    assert.equal(heap.peek(), 1);
    const out = [];
    while (heap.size > 0) out.push(heap.pop());
    assert.deepEqual(out, [1, 2, 3, 5, 7, 8, 9]);
  });

  it('sorts 1,000 random numbers correctly, including duplicates', () => {
    const random = seededRandom(42);
    const values = Array.from({ length: 1000 }, () => Math.floor(random() * 100));
    const heap = new MinHeap(numeric);
    values.forEach((v) => heap.push(v));
    const out = [];
    while (heap.size > 0) out.push(heap.pop());
    assert.deepEqual(
      out,
      [...values].sort((a, b) => a - b),
    );
  });

  it('works when pushes and pops are interleaved', () => {
    const heap = new MinHeap(numeric);
    heap.push(10);
    heap.push(4);
    assert.equal(heap.pop(), 4);
    heap.push(1);
    heap.push(7);
    assert.equal(heap.pop(), 1);
    assert.equal(heap.pop(), 7);
    assert.equal(heap.pop(), 10);
    assert.equal(heap.pop(), undefined);
  });

  it('uses the comparator for tie-breaking', () => {
    const heap = new MinHeap((a, b) => a.f - b.f || a.code.localeCompare(b.code));
    heap.push({ f: 1, code: 'B' });
    heap.push({ f: 1, code: 'A' });
    heap.push({ f: 0.5, code: 'Z' });
    assert.deepEqual([heap.pop().code, heap.pop().code, heap.pop().code], ['Z', 'A', 'B']);
  });

  it('requires a comparator', () => {
    assert.throws(() => new MinHeap(), TypeError);
  });
});
