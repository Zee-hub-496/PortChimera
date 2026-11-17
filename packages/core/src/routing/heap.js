/**
 * Binary min-heap: a priority queue where `pop()` returns the smallest item first.
 *
 * It is stored in a plain array. For the item at index i, its children are at 2i+1 and 2i+2,
 * and its parent is at floor((i-1)/2). Every parent is "smaller or equal" than its children,
 * so the smallest item is always at index 0. push and pop both take O(log n).
 *
 * The comparator makes the heap reusable and lets the caller control tie-breaking, which is
 * what keeps route results deterministic.
 */
export class MinHeap {
  /**
   * @param {(a: any, b: any) => number} compare negative if a should come out before b
   */
  constructor(compare) {
    if (typeof compare !== 'function') throw new TypeError('MinHeap needs a compare function');
    this.compare = compare;
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  peek() {
    return this.items[0];
  }

  push(item) {
    const items = this.items;
    items.push(item);
    // Sift up: swap with the parent while we are smaller than it.
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(items[i], items[parent]) >= 0) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }

  /** @returns the smallest item, or undefined when empty */
  pop() {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      // Sift down: swap with the smaller child while a child is smaller than us.
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && this.compare(items[left], items[smallest]) < 0) smallest = left;
        if (right < items.length && this.compare(items[right], items[smallest]) < 0) {
          smallest = right;
        }
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest], items[i]];
        i = smallest;
      }
    }
    return top;
  }
}
