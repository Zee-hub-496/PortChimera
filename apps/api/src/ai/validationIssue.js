// Turns one zod issue into a log-safe string such as "fields.total_gross_weight: unrecognized_keys".
// Plain module (no zod). It never includes document values: only the path, the issue code and,
// for unrecognized_keys, key names that look like field names. Anything else is dropped.

const SAFE_NAME = /^[A-Za-z0-9_]{1,40}$/;

/** @param {{path?: Array<string|number>, code?: string, keys?: string[]} | undefined} issue */
export function describeIssue(issue) {
  const where = (issue?.path ?? []).map((p) => (typeof p === 'number' ? '[]' : String(p)));
  const path = where.length > 0 ? where.join('.') : 'root';
  const code = SAFE_NAME.test(issue?.code ?? '') ? issue.code : 'invalid';
  let text = `${path}: ${code}`;
  if (code === 'unrecognized_keys' && Array.isArray(issue.keys)) {
    const keys = issue.keys.filter((k) => typeof k === 'string' && SAFE_NAME.test(k)).slice(0, 5);
    if (keys.length > 0) text += ` (${keys.join(', ')})`;
  }
  return text;
}
