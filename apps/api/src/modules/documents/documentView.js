/**
 * Maps a documents row to the camelCase object the API returns. storage_path is left out on
 * purpose: clients get files only through short-lived signed URLs.
 */
export function toDocumentView(row) {
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    documentType: row.document_type,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    processingStatus: row.processing_status,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
  };
}

/** Same as toDocumentView plus the AI output and the human-approved version. */
export function toDocumentDetailView(row, extraction) {
  return {
    ...toDocumentView(row),
    extraction: extraction
      ? {
          payload: extraction.payload,
          reviewedPayload: extraction.reviewed_payload ?? null,
          model: extraction.model,
          schemaVersion: extraction.schema_version,
          reviewedAt: extraction.reviewed_at ?? null,
        }
      : null,
  };
}

/**
 * Turns a reviewed invoice payload into line_items rows. Lines without a description are
 * skipped (the column is required). Numbers that are not plain non-negative numbers become null.
 */
export function buildLineItemRows({ shipmentId, documentId, payload }) {
  const num = (f) => {
    const v = f?.value;
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const text = (f) => {
    const v = f?.value;
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  };
  const currencyRaw = text(payload.fields?.currency)?.toUpperCase() ?? null;
  const currency = currencyRaw && currencyRaw.length === 3 ? currencyRaw : null;

  const rows = [];
  for (const line of payload.lines ?? []) {
    const description = text(line.description) ?? text(line.name);
    if (!description) continue;
    rows.push({
      shipment_id: shipmentId,
      source_document_id: documentId,
      line_no: rows.length + 1,
      description,
      quantity: num(line.quantity),
      unit: text(line.unit),
      unit_price: num(line.unit_price),
      total_value: num(line.line_total),
      currency,
      net_weight_kg: num(line.net_weight),
      gross_weight_kg: num(line.gross_weight),
      origin_country: text(line.country_of_origin),
    });
  }
  return rows;
}
