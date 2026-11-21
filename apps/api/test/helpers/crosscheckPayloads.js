// Reviewed payloads equivalent to what the demo PDFs in fixtures/documents/demo-*.pdf should
// give after extraction and human approval. Used by the cross-check tests.
import { field, missing } from './plainParser.js';

const EXPORTER = 'Example Textiles Ltd, Izmir, Turkey';
const IMPORTER = 'Sample Retail GmbH, Hamburg, Germany';

const invoice = () => ({
  schema_version: 2,
  document_type: 'commercial_invoice',
  fields: {
    invoice_number: field('INV-2025-0100'),
    invoice_date: field('2025-04-02'),
    exporter: field(EXPORTER),
    importer: field(IMPORTER),
    origin_country: field('Turkey'),
    destination_country: field('Germany'),
    currency: field('EUR'),
    total_value: field('10500.00'),
    incoterm: field('FOB'),
    total_net_weight: field('450 kg'),
    total_gross_weight: field('500 kg'),
  },
  lines: [
    {
      name: field('Cotton T-shirts'),
      description: missing(),
      quantity: field(1000),
      unit: field('pcs'),
      unit_price: field('4.50'),
      line_total: field('4500.00'),
      net_weight: field('200 kg'),
      gross_weight: field('230 kg'),
      country_of_origin: field('Turkey'),
    },
    {
      name: field('Denim jeans'),
      description: missing(),
      quantity: field(500),
      unit: field('pcs'),
      unit_price: field('12.00'),
      line_total: field('6000.00'),
      net_weight: field('250 kg'),
      gross_weight: field('270 kg'),
      country_of_origin: field('Turkey'),
    },
  ],
});

const packingList = (gross) => ({
  schema_version: 1,
  document_type: 'packing_list',
  fields: {
    exporter: field(EXPORTER),
    importer: field(IMPORTER),
    invoice_number: field('INV-2025-0100'),
    total_net_weight: field('450 kg'),
    total_gross_weight: field(gross),
  },
  lines: [
    {
      description: field('Cotton T-shirts'),
      quantity: field(1000),
      unit: field('pcs'),
      net_weight: field('200 kg'),
      gross_weight: missing(),
    },
    {
      description: field('Denim jeans'),
      quantity: field(500),
      unit: field('pcs'),
      net_weight: field('250 kg'),
      gross_weight: missing(),
    },
  ],
});

const certificate = () => ({
  schema_version: 1,
  document_type: 'certificate_of_origin',
  fields: {
    exporter: field(EXPORTER),
    importer: field(IMPORTER),
    goods_description: field('Cotton T-shirts and denim jeans'),
    origin_country: field('Turkey'),
    invoice_number: field('INV-2025-0100'),
  },
});

/** Rows as the service builds them. Default: consistent. Pass packingGross '650 kg' for the mismatch. */
export function demoRows({ packingGross = '500 kg' } = {}) {
  return [
    { document_type: 'commercial_invoice', reviewed_payload: invoice() },
    { document_type: 'packing_list', reviewed_payload: packingList(packingGross) },
    { document_type: 'certificate_of_origin', reviewed_payload: certificate() },
  ];
}
