/**
 * Pure mapper from a database shipment row to the camelCase object the API returns.
 * `portsById` is a Map of port id -> { code, name }. Only these fields leave the API,
 * so user_id and internal columns are never exposed.
 */
export function toShipmentView(row, portsById) {
  const port = (id) => {
    const p = portsById.get(id);
    return p ? { code: p.code, name: p.name } : null;
  };
  return {
    id: row.id,
    shipmentNumber: row.shipment_number,
    origin: port(row.origin_port_id),
    destination: port(row.destination_port_id),
    incoterm: row.incoterm ?? null,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Builds the id -> port Map used by toShipmentView. */
export function indexPorts(portRows) {
  return new Map(portRows.map((p) => [p.id, p]));
}
