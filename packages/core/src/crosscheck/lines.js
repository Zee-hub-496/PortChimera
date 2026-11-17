import { descriptionTokens, tokenOverlap } from './normalize.js';
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
