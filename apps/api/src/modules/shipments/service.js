import { AppError } from '../../middleware/errorHandler.js';
import { recordAudit } from '../audit/service.js';
import { indexPorts, toShipmentView } from './shipmentView.js';

const UNIQUE_VIOLATION = '23505';

async function loadPortsByIds(db, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await db.from('ports').select('id, code, name, country').in('id', unique);
  if (error) throw new AppError(500, 'PORT_LOOKUP_FAILED', 'Could not load ports');
  return indexPorts(data ?? []);
}

/**
 * Creates a shipment for the signed-in user. `input` is already validated.
 * The user id comes from the sign-in (`userId`), never from the request body.
 *
 * Audit policy: the insert and the audit write are two separate calls (no transaction). If the
 * audit write fails after the shipment exists, we return success and log the failure loudly
 * (`audit_write_failed`), because a 500 here would make a retry hit the unique shipment number
 * (409) while the shipment already exists. Move both into one RPC when a transaction is added.
 */
export async function createShipment(db, userId, input, logger = console) {
  const { shipmentNumber, originPortCode, destinationPortCode, incoterm } = input;

  const { data: ports, error: portError } = await db
    .from('ports')
    .select('id, code, name, country')
    .in('code', [originPortCode, destinationPortCode]);
  if (portError) throw new AppError(500, 'PORT_LOOKUP_FAILED', 'Could not load ports');
  const byCode = new Map((ports ?? []).map((p) => [p.code, p]));
  const origin = byCode.get(originPortCode);
  const destination = byCode.get(destinationPortCode);
  if (!origin || !destination) {
    const missing = !origin ? originPortCode : destinationPortCode;
    throw new AppError(422, 'UNKNOWN_PORT', `Unknown port code ${missing}`);
  }

  const { data: row, error } = await db
    .from('shipments')
    .insert({
      user_id: userId,
      shipment_number: shipmentNumber,
      origin_country: origin.country,
      destination_country: destination.country,
      origin_port_id: origin.id,
      destination_port_id: destination.id,
      incoterm: incoterm ?? null,
    })
    .select()
    .single();
  if (error?.code === UNIQUE_VIOLATION) {
    throw new AppError(
      409,
      'SHIPMENT_NUMBER_EXISTS',
      'You already have a shipment with that number',
    );
  }
  if (error || !row) throw new AppError(500, 'SHIPMENT_CREATE_FAILED', 'Could not create shipment');

  try {
    await recordAudit(db, {
      userId,
      shipmentId: row.id,
      action: 'shipment.created',
      details: { shipmentNumber, origin: originPortCode, destination: destinationPortCode },
    });
  } catch (err) {
    logger.error('audit_write_failed', {
      action: 'shipment.created',
      shipmentId: row.id,
      userId,
      reason: err?.code ?? err?.message,
    });
  }

  return toShipmentView(row, indexPorts([origin, destination]));
}

/** Lists the caller's shipments, newest first. */
export async function listShipments(db, userId) {
  const { data, error } = await db
    .from('shipments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new AppError(500, 'SHIPMENT_LIST_FAILED', 'Could not load shipments');
  const rows = data ?? [];
  const ports = await loadPortsByIds(
    db,
    rows.flatMap((r) => [r.origin_port_id, r.destination_port_id]),
  );
  return rows.map((r) => toShipmentView(r, ports));
}

/** Returns the raw shipment row, or null when it does not exist or belongs to someone else. */
export async function getShipmentRow(db, userId, id) {
  const { data, error } = await db
    .from('shipments')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new AppError(500, 'SHIPMENT_LOOKUP_FAILED', 'Could not load the shipment');
  return data ?? null;
}

/** Returns the shipment view, or null when it does not exist or is not the caller's. */
export async function getShipment(db, userId, id) {
  const row = await getShipmentRow(db, userId, id);
  if (!row) return null;
  const ports = await loadPortsByIds(db, [row.origin_port_id, row.destination_port_id]);
  return toShipmentView(row, ports);
}
