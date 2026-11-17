import { AppError } from '../../middleware/errorHandler.js';

/**
 * Writes one entry to the audit log. Every state-changing action in the app calls this.
 *
 * It uses the CALLER's database client, so the database itself checks that the entry belongs
 * to that user (the table's policy only allows inserting rows with your own user id), and the
 * table has no update or delete policy, so history cannot be rewritten.
 *
 * If the write fails this THROWS. An action that cannot be audited should not succeed silently.
 *
 * Do not put secrets, tokens, document text or AI output in `details`; record ids and short facts.
 *
 * @param {object} db req.db
 * @param {{userId: string, shipmentId?: string | null, action: string, details?: object}} entry
 */
export async function recordAudit(db, { userId, shipmentId = null, action, details = {} }) {
  if (typeof userId !== 'string' || userId === '')
    throw new TypeError('recordAudit needs a userId');
  if (typeof action !== 'string' || action.trim() === '')
    throw new TypeError('recordAudit needs an action');
  if (details === null || typeof details !== 'object' || Array.isArray(details)) {
    throw new TypeError('recordAudit details must be a plain object');
  }

  const { error } = await db
    .from('audit_logs')
    .insert({ user_id: userId, shipment_id: shipmentId, action: action.trim(), details });
  if (error) throw new AppError(500, 'AUDIT_WRITE_FAILED', 'Could not record the action');
}
