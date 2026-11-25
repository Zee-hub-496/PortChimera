// Field names per document type. Plain module (no zod) so the prompt, the validator
// tests and the web review screen can all share one list.
// `fields` are top-level values. `lineFields` are the values inside each entry of `lines`.
// Names in `optional` may be left out completely when the document does not have them.

// Version 2 added optional total_net_weight and total_gross_weight to commercial_invoice.
// Version 3 added optional freight_charges, insurance_charges, tax_amount and discount_amount to
// commercial_invoice (so the invoice total can be checked against its lines plus charges) and an
// optional invoice_date to packing_list and certificate_of_origin.
// Older payloads are still valid (the new names are optional); each bump only stops the
// extraction cache from reusing results that never looked for the new values.
export const SCHEMA_VERSION = 3;

export const FIELD_STATUSES = Object.freeze(['extracted', 'missing', 'uncertain', 'conflicting']);

export const DOCUMENT_FIELDS = Object.freeze({
  commercial_invoice: {
    fields: [
      'invoice_number',
      'invoice_date',
      'exporter',
      'importer',
      'origin_country',
      'destination_country',
      'currency',
      'total_value',
      'incoterm',
      'total_net_weight',
      'total_gross_weight',
      'freight_charges',
      'insurance_charges',
      'tax_amount',
      'discount_amount',
    ],
    optional: [
      'incoterm',
      'total_net_weight',
      'total_gross_weight',
      'freight_charges',
      'insurance_charges',
      'tax_amount',
      'discount_amount',
    ],
    lineFields: [
      'name',
      'description',
      'quantity',
      'unit',
      'unit_price',
      'line_total',
      'net_weight',
      'gross_weight',
      'country_of_origin',
    ],
  },
  packing_list: {
    fields: [
      'exporter',
      'importer',
      'invoice_number',
      'invoice_date',
      'total_net_weight',
      'total_gross_weight',
    ],
    optional: ['invoice_number', 'invoice_date'],
    lineFields: ['description', 'quantity', 'unit', 'net_weight', 'gross_weight'],
  },
  certificate_of_origin: {
    fields: [
      'exporter',
      'importer',
      'goods_description',
      'origin_country',
      'invoice_number',
      'invoice_date',
      'quantity',
      'weight',
    ],
    optional: ['importer', 'invoice_number', 'invoice_date', 'quantity', 'weight'],
    lineFields: [],
  },
});
