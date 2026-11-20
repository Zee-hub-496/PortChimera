// Field names per document type. Plain module (no zod) so the prompt, the validator
// tests and the web review screen can all share one list.
// `fields` are top-level values. `lineFields` are the values inside each entry of `lines`.
// Names in `optional` may be left out completely when the document does not have them.

export const SCHEMA_VERSION = 1;

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
    ],
    optional: ['incoterm'],
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
    fields: ['exporter', 'importer', 'invoice_number', 'total_net_weight', 'total_gross_weight'],
    optional: ['invoice_number'],
    lineFields: ['description', 'quantity', 'unit', 'net_weight', 'gross_weight'],
  },
  certificate_of_origin: {
    fields: [
      'exporter',
      'importer',
      'goods_description',
      'origin_country',
      'invoice_number',
      'quantity',
      'weight',
    ],
    optional: ['importer', 'invoice_number', 'quantity', 'weight'],
    lineFields: [],
  },
});
