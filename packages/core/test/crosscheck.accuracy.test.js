// Day 5 regression tests: false positives and over-guessing found in review of the cross-checker.
// Each test is named for the false result it prevents. Real mismatches must still be reported.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crossCheck } from '../src/index.js';
import {
  isAmbiguousNumber,
  normalizeCountry,
  numberReadings,
  parseWeight,
  readDates,
} from '../src/crosscheck/normalize.js';

const loadFixture = (name) => {
  const docs = JSON.parse(
    readFileSync(new URL(`../../../fixtures/crosscheck/${name}.json`, import.meta.url), 'utf8'),
  );
  delete docs._note;
  return docs;
};
const baseDocs = () => loadFixture('demo-consistent');
const findingFor = (report, field) => report.findings.find((f) => f.field === field);
const fieldsOf = (report) => report.findings.map((f) => f.field);

describe('country aliases (Germany vs Deutschland)', () => {
  it('reads native-language and punctuated names as the same country', () => {
    const same = [
      ['Deutschland', 'DE'],
      ['Federal Republic of Germany', 'DE'],
      ['Italia', 'IT'],
      ['España', 'ES'],
      ['Espana', 'ES'],
      ['Nederland', 'NL'],
      ['Türkiye', 'TR'],
      ['P.R. China', 'CN'],
      ['U.S.A.', 'US'],
    ];
    for (const [text, code] of same) assert.equal(normalizeCountry(text).code, code, text);
  });

  it('does not report Germany on one document and Deutschland on another', () => {
    const docs = baseDocs();
    docs.commercial_invoice.originCountry = 'Germany';
    docs.commercial_invoice.lines.forEach((l) => (l.originCountry = 'Germany'));
    docs.certificate_of_origin.originCountry = 'Deutschland';
    assert.equal(findingFor(crossCheck(docs), 'originCountry'), undefined);
  });

  it('still reports two different countries', () => {
    const docs = baseDocs();
    docs.certificate_of_origin.originCountry = 'Deutschland';
    const f = findingFor(crossCheck(docs), 'originCountry');
    assert.ok(f, 'China vs Deutschland must still be a finding');
    assert.equal(f.severity, 'high');
  });
});

describe('ambiguous number formats are uncertain, not guessed', () => {
  it('recognises a single separator followed by exactly three digits as ambiguous', () => {
    for (const s of ['1.234', '1,234', '12,345', '999.999', ' 5.000 ']) {
      assert.equal(isAmbiguousNumber(s), true, s);
    }
    for (const s of [
      '1,234.56',
      '1.234,56',
      '1,234,567',
      '1234',
      '1.5',
      '0.500',
      1.234,
      1234,
      null,
    ]) {
      assert.equal(isAmbiguousNumber(s), false, String(s));
    }
  });

  it('gives both readings of an ambiguous number, and one for a clear number', () => {
    assert.deepEqual(numberReadings('1.234'), [1.234, 1234]);
    assert.deepEqual(numberReadings('1,234'), [1.234, 1234]);
    assert.deepEqual(numberReadings('-2,500'), [-2500, -2.5]);
    assert.deepEqual(numberReadings('1,234.56'), [1234.56]);
    assert.deepEqual(numberReadings(1.234), [1.234]);
    assert.deepEqual(numberReadings('abc'), []);
  });

  it('marks a weight like "1.234 kg" as ambiguous and keeps both readings in kg', () => {
    const w = parseWeight('1.234 kg');
    assert.equal(w.ambiguous, true);
    assert.deepEqual(w.kgReadings, [1.234, 1234]);
    const clear = parseWeight('1,234.5 kg');
    assert.equal(clear.kg, 1234.5);
    assert.equal(clear.ambiguous, undefined);
  });

  it('does not report "1.000" on one document against "1,000" on another', () => {
    const docs = baseDocs();
    docs.commercial_invoice.lines[0].quantity = '1.000';
    docs.packing_list.lines[0].quantity = '1,000';
    assert.deepEqual(crossCheck(docs).findings, []);
  });

  it('does not report "500,000 g" against "500 kg" (one reading agrees)', () => {
    const docs = baseDocs();
    docs.commercial_invoice.grossWeight = '500 kg';
    docs.packing_list.grossWeight = '500,000 g';
    assert.equal(findingFor(crossCheck(docs), 'grossWeight'), undefined);
  });

  it('still reports a number that no reading can match, and says it was ambiguous', () => {
    const docs = baseDocs();
    docs.commercial_invoice.lines[0].quantity = '1.234';
    docs.packing_list.lines[0].quantity = 5000;
    const f = findingFor(crossCheck(docs), 'quantity');
    assert.ok(f, 'no reading of 1.234 gets close to 5000');
    assert.equal(f.severity, 'high');
    assert.match(f.explanation, /two ways/i);
    assert.match(f.values.commercial_invoice, /^1234 /); // the closest reading
  });

  it('does not report a total that only matches the lines under its other reading', () => {
    const docs = baseDocs();
    docs.commercial_invoice.totalValue = '6.000'; // 6000 or 6; the lines add up to 6000
    assert.equal(findingFor(crossCheck(docs), 'invoiceTotalVsLines'), undefined);
  });

  it('unambiguous numbers are read as before', () => {
    const docs = baseDocs();
    docs.commercial_invoice.lines[0].quantity = '1,000.0';
    docs.packing_list.lines[0].quantity = '1.000,0';
    assert.equal(findingFor(crossCheck(docs), 'quantity'), undefined);
    docs.packing_list.lines[0].quantity = 800;
    assert.equal(findingFor(crossCheck(docs), 'quantity').severity, 'high');
  });
});

describe('split product lines are merged before comparing', () => {
  it('does not report a missing line when an invoice lists one product on two lines', () => {
    const docs = baseDocs();
    const [shirts] = docs.commercial_invoice.lines;
    docs.commercial_invoice.lines = [
      { ...shirts, quantity: 600, lineTotal: '1,800.00' },
      { ...shirts, quantity: 400, lineTotal: '1,200.00' },
      docs.commercial_invoice.lines[1],
    ];
    const report = crossCheck(docs);
    assert.deepEqual(
      report.findings.filter((f) => f.category === 'quantity' || f.category === 'lineItem'),
      [],
    );
  });

  it('still reports a real quantity difference after merging', () => {
    const docs = baseDocs();
    const [shirts] = docs.commercial_invoice.lines;
    docs.commercial_invoice.lines = [
      { ...shirts, quantity: 600, lineTotal: '1,800.00' },
      { ...shirts, quantity: 300, lineTotal: '1,200.00' },
      docs.commercial_invoice.lines[1],
    ];
    const f = findingFor(crossCheck(docs), 'quantity');
    assert.ok(f, '900 on the invoice against 1000 on the packing list');
    assert.equal(f.values.commercial_invoice, '900 units');
  });

  it('does not merge lines with different units or different goods', () => {
    const docs = baseDocs();
    docs.commercial_invoice.lines = [
      { description: 'Cotton shirts', quantity: 10, unit: 'ctn' },
      { description: 'Cotton shirts', quantity: 100, unit: 'pcs' },
      { description: 'Denim jeans', quantity: 500, unit: 'pcs' },
    ];
    docs.packing_list.lines = [
      { description: 'Cotton shirts', quantity: 10, unit: 'ctn' },
      { description: 'Cotton shirts', quantity: 100, unit: 'pcs' },
      { description: 'Denim jeans', quantity: 500, unit: 'pcs' },
    ];
    assert.equal(findingFor(crossCheck(docs), 'quantity'), undefined);
    assert.equal(findingFor(crossCheck(docs), 'lineItem'), undefined);
  });
});

describe('invoice total with freight, insurance, tax and discount', () => {
  const withCharges = (extra) => {
    const docs = baseDocs();
    Object.assign(docs.commercial_invoice, extra);
    return docs;
  };

  it('accepts a total that is the lines plus freight and insurance', () => {
    const docs = withCharges({
      totalValue: '6,500.00',
      freightCharges: 400,
      insuranceCharges: 100,
    });
    assert.equal(findingFor(crossCheck(docs), 'invoiceTotalVsLines'), undefined);
  });

  it('accepts a total that is the lines plus tax minus a discount', () => {
    const docs = withCharges({ totalValue: '6,300.00', taxAmount: 500, discountAmount: 200 });
    assert.equal(findingFor(crossCheck(docs), 'invoiceTotalVsLines'), undefined);
  });

  it('still reports a total that does not add up even with the charges', () => {
    const docs = withCharges({
      totalValue: '7,500.00',
      freightCharges: 400,
      insuranceCharges: 100,
    });
    const f = findingFor(crossCheck(docs), 'invoiceTotalVsLines');
    assert.ok(f);
    assert.equal(f.severity, 'high');
    assert.match(f.explanation, /freight/i);
  });

  it('is only medium, and says why, when no charges were found to explain the gap', () => {
    const docs = withCharges({ totalValue: 6600 }); // lines add up to 6000
    const f = findingFor(crossCheck(docs), 'invoiceTotalVsLines');
    assert.equal(f.severity, 'medium');
    assert.match(f.explanation, /freight, insurance, tax or a discount/i);
  });
});

describe('invoice date comparison', () => {
  it('reads one numeric date both ways when it is ambiguous', () => {
    assert.deepEqual(readDates('03/04/2026').sort(), ['2026-03-04', '2026-04-03']);
    assert.deepEqual(readDates('2026-04-03'), ['2026-04-03']);
    assert.deepEqual(readDates('13/04/2026'), ['2026-04-13']);
    assert.deepEqual(readDates('not a date'), []);
  });

  it('does not report the same date written in different formats', () => {
    const docs = baseDocs();
    docs.commercial_invoice.invoiceDate = '2026-03-14';
    docs.packing_list.invoiceDate = '14 March 2026';
    docs.certificate_of_origin.invoiceDate = '14/03/2026';
    assert.equal(findingFor(crossCheck(docs), 'invoiceDate'), undefined);
  });

  it('does not report an ambiguous date that can be read as the same day', () => {
    const docs = baseDocs();
    docs.commercial_invoice.invoiceDate = '2026-04-03';
    docs.packing_list.invoiceDate = '03/04/2026';
    assert.equal(findingFor(crossCheck(docs), 'invoiceDate'), undefined);
  });

  it('reports different dates as a medium finding', () => {
    const docs = baseDocs();
    docs.commercial_invoice.invoiceDate = '2026-03-14';
    docs.packing_list.invoiceDate = '2026-03-18';
    const f = findingFor(crossCheck(docs), 'invoiceDate');
    assert.ok(f);
    assert.equal(f.severity, 'medium');
    assert.deepEqual(f.documents, ['commercial_invoice', 'packing_list']);
  });

  it('says so when a date cannot be read, and does not compare it', () => {
    const docs = baseDocs();
    docs.commercial_invoice.invoiceDate = '2026-03-14';
    docs.packing_list.invoiceDate = 'sometime in March';
    const report = crossCheck(docs);
    assert.equal(findingFor(report, 'invoiceDate'), undefined);
    assert.ok(report.summary.notCompared.some((n) => n.field === 'invoiceDate'));
  });

  it('is not compared when only the invoice has a date', () => {
    const docs = baseDocs();
    docs.commercial_invoice.invoiceDate = '2026-03-14';
    const report = crossCheck(docs);
    assert.deepEqual(fieldsOf(report), []);
  });
});

describe('the real weight mismatch is still found', () => {
  it('500 kg against 650 kg is still one high finding', () => {
    const report = crossCheck(loadFixture('demo-weight-mismatch'));
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].field, 'grossWeight');
    assert.equal(report.findings[0].severity, 'high');
  });
});
