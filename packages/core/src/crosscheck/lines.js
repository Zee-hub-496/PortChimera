import {
  descriptionTokens,
  isAmbiguousNumber,
  normalizeUnit,
  parseNumber,
  parseWeight,
  tokenOverlap,
} from './normalize.js';
import { THRESHOLDS } from './severity.js';

/**
 * Pairs up product lines from two documents by how similar their descriptions are.
 *
 * Greedy and simple on purpose: repeatedly take the most similar unpaired pair that is at least
 * `descriptionMatchMin` similar. Ties go to the earliest lines, so results are repeatable.
 * Special case: when each document has exactly ONE line they are paired whatever the wording,
 * because "this is the only product on both" is stronger evidence than the words. A very
 * different description is then reported as a description mismatch instead of two unmatched lines.
 *
 * @param {Array<{description?: string}>} refLines lines of the reference document
 * @param {Array<{description?: string}>} otherLines lines of the other document
 * @returns {{pairs: Array<{refIndex: number, otherIndex: number, overlap: number}>, unmatchedRef: number[], unmatchedOther: number[]}}
 */
export function matchLines(refLines, otherLines) {
  const refTokens = refLines.map((l) => descriptionTokens(l?.description));
  const otherTokens = otherLines.map((l) => descriptionTokens(l?.description));

  const candidates = [];
  refTokens.forEach((r, i) =>
    otherTokens.forEach((o, j) => {
      candidates.push({ refIndex: i, otherIndex: j, overlap: tokenOverlap(r, o) });
    }),
  );
  candidates.sort(
    (a, b) => b.overlap - a.overlap || a.refIndex - b.refIndex || a.otherIndex - b.otherIndex,
  );

  const usedRef = new Set();
  const usedOther = new Set();
  const pairs = [];
  for (const c of candidates) {
    if (c.overlap < THRESHOLDS.descriptionMatchMin) break;
    if (usedRef.has(c.refIndex) || usedOther.has(c.otherIndex)) continue;
    usedRef.add(c.refIndex);
    usedOther.add(c.otherIndex);
    pairs.push(c);
  }

  if (pairs.length === 0 && refLines.length === 1 && otherLines.length === 1) {
    pairs.push({ refIndex: 0, otherIndex: 0, overlap: tokenOverlap(refTokens[0], otherTokens[0]) });
    usedRef.add(0);
    usedOther.add(0);
  }

  pairs.sort((a, b) => a.refIndex - b.refIndex);
  return {
    pairs,
    unmatchedRef: refLines.map((_, i) => i).filter((i) => !usedRef.has(i)),
    unmatchedOther: otherLines.map((_, j) => j).filter((j) => !usedOther.has(j)),
  };
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

// Sums one numeric field over lines. Null when any line lacks it or has a number that can be
// read two ways (a sum of guesses would be a guess).
function sumField(lines, field, read) {
  const parts = lines.map((l) => read(l?.[field]));
  if (parts.some((n) => n === null || n === undefined)) return null;
  return round6(parts.reduce((a, b) => a + b, 0));
}
const plain = (v) => (isAmbiguousNumber(v) ? null : parseNumber(v));
const kgOf = (v) => {
  const w = parseWeight(v);
  return w && w.kg !== null && !w.ambiguous ? w.kg : null;
};

/**
 * Merges lines of one document that list the same goods more than once (same description words
 * and same unit), for example one product split over two shipments or two cartons. Their quantity,
 * line total and weights are added so the document is compared as a whole, not line by line.
 *
 * A group is merged only when every quantity can be added without guessing; otherwise its lines
 * are left alone. Lines with no description words are never merged. Order follows first appearance.
 */
export function mergeDuplicateLines(lines) {
  if (!Array.isArray(lines)) return [];
  const keyOf = (line) => {
    const words = [...new Set(descriptionTokens(line?.description))].sort();
    return words.length === 0 ? null : `${words.join(' ')}|${normalizeUnit(line?.unit) ?? ''}`;
  };
  const groups = new Map();
  const order = [];
  lines.forEach((line, i) => {
    const key = keyOf(line);
    const id = key ?? `single-${i}`;
    if (!groups.has(id)) {
      groups.set(id, []);
      order.push(id);
    }
    groups.get(id).push(line);
  });

  return order.flatMap((id) => {
    const group = groups.get(id);
    if (group.length === 1) return group;
    const quantity = sumField(group, 'quantity', plain);
    if (quantity === null) return group;
    const merged = { ...group[0], quantity };
    const lineTotal = sumField(group, 'lineTotal', plain);
    if (lineTotal === null) delete merged.lineTotal;
    else merged.lineTotal = lineTotal;
    for (const field of ['grossWeight', 'netWeight']) {
      const kg = sumField(group, field, kgOf);
      if (kg === null) delete merged[field];
      else merged[field] = { value: kg, unit: 'kg' };
    }
    return [merged];
  });
}
