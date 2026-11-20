import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEMO_CERTIFICATE_LINES,
  DEMO_INVOICE_LINES,
  DEMO_PACKING_LIST_LINES,
  buildFixtures,
} from '../../../../scripts/generate-document-fixtures.mjs';

describe('cross-check demo PDFs', () => {
  const built = buildFixtures();
  const names = ['demo-invoice.pdf', 'demo-packing-list.pdf', 'demo-certificate-of-origin.pdf'];

  it('exist, are labeled synthetic and match the committed files', () => {
    for (const name of names) {
      assert.match(built[name].toString('latin1'), /SYNTHETIC TEST DOCUMENT/);
      const committed = readFileSync(
        new URL(`../../../../fixtures/documents/${name}`, import.meta.url),
      );
      assert.ok(committed.equals(built[name]), `${name} is out of date, run the generator`);
    }
  });

  it('differ only in gross weight: invoice 500 kg, packing list 650 kg', () => {
    const itemGross = DEMO_INVOICE_LINES.filter((l) => l.startsWith('Item')).flatMap((l) =>
      [...l.matchAll(/ Gross Weight: (\d+) kg/g)].map((m) => Number(m[1])),
    );
    assert.equal(
      itemGross.reduce((a, b) => a + b, 0),
      500,
    );
    assert.ok(DEMO_INVOICE_LINES.includes('Total Gross Weight: 500 kg'));
    assert.ok(DEMO_PACKING_LIST_LINES.includes('Total Gross Weight: 650 kg'));
    for (const lines of [DEMO_INVOICE_LINES, DEMO_PACKING_LIST_LINES, DEMO_CERTIFICATE_LINES]) {
      assert.ok(lines.includes('Invoice No: INV-2025-0100'));
      assert.ok(lines.includes('Exporter: Example Textiles Ltd, Izmir, Turkey'));
    }
  });
});
