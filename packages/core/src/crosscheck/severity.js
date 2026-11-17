/**
 * Every threshold the cross-checker uses, in one place so it is easy to read, explain and change.
 * The reasoning for each is in `.kiro/specs/04-cross-checking/design.md`.
 */
export const THRESHOLDS = Object.freeze({
  // Number differences up to this percent are treated as rounding and not reported.
  numericTolerancePercent: 0.5,
  // Above the tolerance and up to this percent: medium. Above it: high.
  numericHighPercent: 10,
  // An invoice whose stated total differs from the sum of its lines by more than this is high.
  invoiceTotalVsLinesPercent: 1,
  // Company names whose word overlap is at least this are "similar" (low); below it, medium.
  nameSimilarMin: 0.8,
  // Product lines from two documents are treated as the same line when their word overlap is
  // at least this. Between this and descriptionSameMin the wording differs a little (low).
  descriptionMatchMin: 0.3,
  descriptionSameMin: 0.6,
});

/** From mildest to most serious. */
export const SEVERITIES = Object.freeze(['low', 'medium', 'high', 'critical']);

export const severityRank = (severity) => SEVERITIES.indexOf(severity);

/** The more serious of the given severities, or null for an empty list. */
export function maxSeverity(list) {
  return list.reduce(
    (worst, s) => (worst === null || severityRank(s) > severityRank(worst) ? s : worst),
    null,
  );
}

/**
 * How far apart two numbers are, as a percent of the LARGER one.
 * Using the larger value makes the answer the same whichever document is called "first":
 * 500 vs 650 is 23.1% either way. (Dividing by the smaller or the first value would give 30% or 23.1%
 * depending on order, which would make the report depend on an arbitrary choice.)
 */
export function percentDifference(a, b) {
  const larger = Math.max(Math.abs(a), Math.abs(b));
  return larger === 0 ? 0 : (Math.abs(a - b) / larger) * 100;
}

/**
 * Severity for a numeric difference, or null when it is small enough to ignore as rounding.
 * @param {number} percent from percentDifference
 */
export function severityForNumeric(percent, tolerancePercent = THRESHOLDS.numericTolerancePercent) {
  if (percent <= tolerancePercent) return null;
  return percent <= THRESHOLDS.numericHighPercent ? 'medium' : 'high';
}
