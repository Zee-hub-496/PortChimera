import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CrossCheckInputError, crossCheck } from '../src/index.js';

// --- helpers -----------------------------------------------------------------------------

const loadFixture = (name) => {
  const docs = JSON.parse(
    readFileSync(new URL(`../../../fixtures/crosscheck/${name}.json`, import.meta.url), 'utf8'),
  );
  delete docs._note;
  return docs;
};
const baseDocs = () => loadFixture('demo-consistent');
const fieldsOf = (report) => report.findings.map((f) => f.field);
const findingFor = (report, field) => report.findings.find((f) => f.field === field);
const deepFreeze = (o) => {
  Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v));
  return Object.freeze(o);
};

// --- the demo fixtures ---------------------------------------------------------------------

describe('crossCheck: demo fixtures', () => {
  it('reports nothing for matching documents, even though their formatting differs a lot', () => {
    const report = crossCheck(baseDocs());
    assert.deepEqual(report.findings, []);
    assert.equal(report.summary.overall, 'consistent');
    assert.ok(report.summary.comparedFields.includes('grossWeight'));
    assert.ok(report.summary.comparedFields.includes('lineItems'));
  });

  it('finds exactly the planted 500 kg vs 650 kg weight mismatch', () => {
    const report = crossCheck(loadFixture('demo-weight-mismatch'));
    assert.equal(report.findings.length, 1);
    const f = report.findings[0];
    assert.equal(f.field, 'grossWeight');
    assert.equal(f.severity, 'high');
    assert.equal(f.category, 'weight');
    assert.deepEqual(f.documents, ['commercial_invoice', 'packing_list']);
    assert.deepEqual(f.values, { commercial_invoice: '500 kg', packing_list: '650 kg' });
    assert.deepEqual(f.difference, { absolute: 150, percent: 23.077, unit: 'kg' });
    assert.match(f.explanation, /Possible inconsistency in gross weight/);
    assert.match(f.explanation, /150 kg \(23\.1% of the larger value\)/);
    assert.match(f.recommendedAction, /manual verification/);
  });

  it('the mismatch fixture differs from the consistent one only in that weight', () => {
    const patched = baseDocs();
    patched.packing_list.grossWeight = { value: '650.00', unit: 'KGS' };
    assert.deepEqual(loadFixture('demo-weight-mismatch'), patched);
  });
});

// --- weights ------------------------------------------------------------------------------

describe('crossCheck: weights', () => {
  const withWeights = (invoice, packing, certificate) => {
    const docs = baseDocs();
    docs.commercial_invoice.grossWeight = invoice;
    docs.packing_list.grossWeight = packing;
    if (certificate !== undefined) docs.certificate_of_origin.grossWeight = certificate;
    return docs;
  };

  it('treats kg, grams, pounds and tonnes of the same weight as equal', () => {
    const report = crossCheck(
      withWeights('500 kg', { value: '500,000', unit: 'g' }, '1,102.31 lbs'),
    );
    assert.equal(findingFor(report, 'grossWeight'), undefined);
  });

  it('ignores differences within the rounding tolerance', () => {
    assert.equal(findingFor(crossCheck(withWeights('500 kg', '501 kg')), 'grossWeight'), undefined); // 0.2%
  });

  it('grades differences: just over tolerance and up to 10% is medium, above 10% is high', () => {
    assert.equal(
      findingFor(crossCheck(withWeights('500 kg', '504 kg')), 'grossWeight').severity,
      'medium',
    ); // 0.8%
    assert.equal(
      findingFor(crossCheck(withWeights('500 kg', '540 kg')), 'grossWeight').severity,
      'medium',
    ); // 7.4%
    assert.equal(
      findingFor(crossCheck(withWeights('500 kg', '560 kg')), 'grossWeight').severity,
      'high',
    ); // 10.7%
  });

  it('puts exactly 10% on the medium side of the boundary', () => {
    assert.equal(
      findingFor(crossCheck(withWeights('500 kg', '450 kg')), 'grossWeight').severity,
      'medium',
    );
  });

  it('gives the same percentage whichever document is larger', () => {
    const a = findingFor(crossCheck(withWeights('500 kg', '650 kg')), 'grossWeight').difference
      .percent;
    const b = findingFor(crossCheck(withWeights('650 kg', '500 kg')), 'grossWeight').difference
      .percent;
    assert.equal(a, b);
  });

  it('compares all documents that state a weight in one finding', () => {
    const f = findingFor(crossCheck(withWeights('500 kg', '500 kg', '700 kg')), 'grossWeight');
    assert.deepEqual(f.documents, ['certificate_of_origin', 'commercial_invoice', 'packing_list']);
    assert.equal(f.difference.absolute, 200);
  });

  it('adds up line weights when a document gives no total', () => {
    const docs = baseDocs();
    delete docs.packing_list.grossWeight;
    docs.packing_list.lines[0].grossWeight = '300 kg';
    docs.packing_list.lines[1].grossWeight = '350 kg';
    const f = findingFor(crossCheck(docs), 'grossWeight');
    assert.equal(f.values.packing_list, '650 kg');
    assert.equal(f.severity, 'high');
  });

  it('does not use partial line weights as a total', () => {
    const docs = baseDocs();
    delete docs.packing_list.grossWeight;
    docs.packing_list.lines[0].grossWeight = '300 kg'; // second line has none
    const report = crossCheck(docs);
    assert.equal(findingFor(report, 'grossWeight').category, 'completeness'); // reported as an information gap, not a mismatch
    assert.equal(findingFor(report, 'grossWeight').severity, 'low');
  });

  it('excludes weights it cannot trust and says so, instead of guessing', () => {
    for (const bad of ['12 tons', 500, 'heavy']) {
      const report = crossCheck(withWeights('500 kg', bad));
      const f = findingFor(report, 'grossWeight');
      assert.equal(f.category, 'completeness', String(bad));
      assert.equal(f.severity, 'medium');
      assert.deepEqual(f.documents, ['packing_list']);
      assert.match(f.explanation, /excluded from comparison/);
    }
  });

  it('compares net weight separately from gross weight', () => {
    const docs = baseDocs();
    docs.packing_list.netWeight = { value: '0.5', unit: 'tonnes' }; // 500 kg against 450 kg
    const report = crossCheck(docs);
    assert.deepEqual(fieldsOf(report), ['netWeight']);
    assert.equal(report.findings[0].difference.absolute, 50);
  });
});

// --- quantities and product lines ---------------------------------------------------------

describe('crossCheck: quantities and lines', () => {
  it('finds a quantity mismatch on the matching product line', () => {
    const docs = baseDocs();
    docs.packing_list.lines[0].quantity = 900; // 1000 vs 900
    const f = findingFor(crossCheck(docs), 'quantity');
    assert.equal(f.severity, 'medium');
    assert.deepEqual(f.difference, { absolute: 100, percent: 10, unit: 'units' });
    assert.match(f.explanation, /quantity of line 1 \("Men's cotton t-shirts"\)/);
    assert.match(
      f.explanation,
      /1000 units on the commercial invoice and 900 units on the packing list/,
    );
  });

  it('treats a large quantity gap as high', () => {
    const docs = baseDocs();
    docs.packing_list.lines[1].quantity = 250;
    assert.equal(findingFor(crossCheck(docs), 'quantity').severity, 'high');
  });

  it('reports the spec example: 100 vs 90 units is a difference of 10', () => {
    const docs = baseDocs();
    docs.commercial_invoice.lines = [docs.commercial_invoice.lines[0]];
    docs.commercial_invoice.lines[0].quantity = 100;
    docs.packing_list.lines = [docs.packing_list.lines[0]];
    docs.packing_list.lines[0].quantity = 90;
    const f = findingFor(crossCheck(docs), 'quantity');
    assert.equal(f.difference.absolute, 10);
  });

  it('matches lines by description, not by position', () => {
    const docs = baseDocs();
    docs.packing_list.lines.reverse();
    assert.deepEqual(crossCheck(docs).findings, []);
  });

  it('reports different units instead of comparing the numbers', () => {
    const docs = baseDocs();
    docs.packing_list.lines[0].unit = 'Cartons';
    const f = findingFor(crossCheck(docs), 'quantity');
    assert.equal(f.severity, 'medium');
    assert.match(f.explanation, /the units differ/);
    assert.equal(f.difference, null);
  });

  it('skips quantity checks when a document gives no quantity', () => {
    const docs = baseDocs();
    delete docs.packing_list.lines[0].quantity;
    assert.deepEqual(crossCheck(docs).findings, []);
  });

  it('reports a product that appears on only one document', () => {
    const docs = baseDocs();
    docs.packing_list.lines.push({ description: 'Leather belts', quantity: 10, unit: 'pcs' });
    const f = findingFor(crossCheck(docs), 'lineItem');
    assert.equal(f.severity, 'medium');
    assert.match(f.explanation, /Leather belts/);
    assert.match(f.explanation, /no matching line on the commercial invoice/);
  });

  it('reports an invoice line that is missing from the packing list', () => {
    const docs = baseDocs();
    docs.packing_list.lines.pop();
    const f = findingFor(crossCheck(docs), 'lineItem');
    assert.match(f.explanation, /line 2 of the commercial invoice \("Denim jeans, adult"\)/);
  });

  it('flags a changed product description', () => {
    const docs = baseDocs();
    docs.commercial_invoice.lines = [docs.commercial_invoice.lines[0]];
    docs.packing_list.lines = [{ ...docs.packing_list.lines[0], description: 'Steel pipes' }];
    const f = findingFor(crossCheck(docs), 'description');
    assert.equal(f.severity, 'medium');
    assert.match(f.explanation, /Steel pipes/);
  });

  it('treats wording that differs a little as low', () => {
    const docs = baseDocs();
    docs.commercial_invoice.lines = [
      {
        ...docs.commercial_invoice.lines[0],
        description: 'cotton t-shirts mens summer collection',
      },
    ];
    docs.packing_list.lines = [
      { ...docs.packing_list.lines[0], description: 'cotton t-shirts boxed' },
    ];
    assert.equal(findingFor(crossCheck(docs), 'description').severity, 'low');
  });

  it('accepts a certificate that summarizes the goods, and flags one that names other goods', () => {
    assert.deepEqual(crossCheck(baseDocs()).findings, []); // one summary line against two invoice lines
    const docs = baseDocs();
    docs.certificate_of_origin.lines = [{ description: 'Steel pipes' }];
    const f = findingFor(crossCheck(docs), 'description');
    assert.equal(f.severity, 'medium');
    assert.deepEqual(f.documents, ['certificate_of_origin', 'commercial_invoice']);
  });
});

// --- origin, currency, value, identifiers, parties -------------------------------------------

describe('crossCheck: origin', () => {
  it('flags an origin that differs between invoice and certificate (spec example: China vs Pakistan)', () => {
    const docs = baseDocs();
    docs.certificate_of_origin.originCountry = 'Pakistan';
    const f = findingFor(crossCheck(docs), 'originCountry');
    assert.equal(f.severity, 'high');
    assert.equal(f.category, 'origin');
    assert.deepEqual(f.documents, ['certificate_of_origin', 'commercial_invoice']);
  });

  it('does not flag a country written as a code, a name or a phrase', () => {
    for (const text of ['CN', 'china', "People's Republic of China", 'Made in China']) {
      const docs = baseDocs();
      docs.certificate_of_origin.originCountry = text;
      assert.equal(findingFor(crossCheck(docs), 'originCountry'), undefined, text);
    }
  });

  it('is less sure when a country name is not recognized', () => {
    const docs = baseDocs();
    docs.certificate_of_origin.originCountry = 'Atlantis';
    const f = findingFor(crossCheck(docs), 'originCountry');
    assert.equal(f.severity, 'medium');
    assert.match(f.explanation, /not recognized/);
  });

  it('uses the origin shared by all lines when the document gives none', () => {
    const docs = baseDocs();
    delete docs.commercial_invoice.originCountry; // lines still say China
    docs.certificate_of_origin.originCountry = 'Pakistan';
    assert.equal(findingFor(crossCheck(docs), 'originCountry').severity, 'high');
  });

  it('does not guess an origin when lines disagree', () => {
    const docs = baseDocs();
    delete docs.commercial_invoice.originCountry;
    docs.commercial_invoice.lines[1].originCountry = 'India';
    const report = crossCheck(docs);
    assert.equal(findingFor(report, 'originCountry'), undefined);
    assert.ok(report.summary.notCompared.some((n) => n.field === 'originCountry'));
  });

  it('reports an information gap when the certificate states no origin', () => {
    const docs = baseDocs();
    delete docs.certificate_of_origin.originCountry;
    const f = findingFor(crossCheck(docs), 'originCountry');
    assert.equal(f.severity, 'low');
    assert.equal(f.category, 'completeness');
    assert.equal(f.values.certificate_of_origin, 'not provided');
  });
});

describe('crossCheck: currency and value', () => {
  it('flags different currencies and then does not compare values across them', () => {
    const docs = baseDocs();
    docs.packing_list.currency = 'EUR';
    docs.certificate_of_origin.currency = 'EUR';
    docs.certificate_of_origin.totalValue = 5500;
    const report = crossCheck(docs);
    assert.equal(findingFor(report, 'currency').severity, 'high');
    assert.equal(findingFor(report, 'totalValue'), undefined);
    assert.ok(
      report.summary.notCompared.some(
        (n) => n.field === 'totalValue' && /different currencies/.test(n.reason),
      ),
    );
  });

  it('does not flag "US$" against "USD"', () => {
    const docs = baseDocs();
    docs.packing_list.currency = 'US$';
    assert.equal(findingFor(crossCheck(docs), 'currency'), undefined);
  });

  it('flags a total value that differs between documents in the same currency', () => {
    const docs = baseDocs();
    docs.certificate_of_origin.currency = 'usd';
    docs.certificate_of_origin.totalValue = '5,000';
    const f = findingFor(crossCheck(docs), 'totalValue');
    assert.equal(f.severity, 'high');
    assert.equal(f.category, 'value');
    assert.equal(f.values.commercial_invoice, '6000 USD');
  });

  it('flags an invoice whose stated total differs from the sum of its lines by more than 1%', () => {
    const docs = baseDocs();
    docs.commercial_invoice.totalValue = 7000; // lines add up to 6000
    const f = findingFor(crossCheck(docs), 'invoiceTotalVsLines');
    // Nothing itemizes freight, insurance, tax or a discount, so this is medium (Day 5: it used
    // to be high, which wrongly flagged every invoice with freight on it).
    assert.equal(f.severity, 'medium');
    assert.deepEqual(f.documents, ['commercial_invoice']);
    assert.equal(f.difference.absolute, 1000);
  });

  it('accepts a stated total within 1% of its lines', () => {
    const docs = baseDocs();
    docs.commercial_invoice.totalValue = '6,050.00'; // 0.8%
    assert.equal(findingFor(crossCheck(docs), 'invoiceTotalVsLines'), undefined);
  });

  it('skips the lines check when a line has no total', () => {
    const docs = baseDocs();
    delete docs.commercial_invoice.lines[0].lineTotal;
    docs.commercial_invoice.totalValue = 9999;
    assert.equal(findingFor(crossCheck(docs), 'invoiceTotalVsLines'), undefined);
  });
});

describe('crossCheck: identifiers and parties', () => {
  it('flags different invoice numbers', () => {
    const docs = baseDocs();
    docs.packing_list.invoiceNumber = 'INV-2026-0043';
    const f = findingFor(crossCheck(docs), 'invoiceNumber');
    assert.equal(f.severity, 'high');
  });

  it('does not flag an invoice number written with other case, spaces or dashes', () => {
    assert.equal(findingFor(crossCheck(baseDocs()), 'invoiceNumber'), undefined); // fixture already uses three spellings
  });

  it('reports an information gap when the invoice has no number but other documents do', () => {
    const docs = baseDocs();
    delete docs.commercial_invoice.invoiceNumber;
    const f = findingFor(crossCheck(docs), 'invoiceNumber');
    assert.equal(f.category, 'completeness');
    assert.deepEqual(Object.keys(f.values).sort(), [
      'certificate_of_origin',
      'commercial_invoice',
      'packing_list',
    ]);
  });

  it('flags a completely different exporter as medium', () => {
    const docs = baseDocs();
    docs.packing_list.exporter = 'Northern Steel Works';
    assert.equal(findingFor(crossCheck(docs), 'exporter').severity, 'medium');
  });

  it('flags a similar but not identical company name as low', () => {
    const docs = baseDocs();
    docs.commercial_invoice.exporter = 'Alpha Beta Gamma Delta Epsilon Ltd';
    docs.packing_list.exporter = 'Alpha Beta Gamma Delta Limited';
    docs.certificate_of_origin.exporter = 'Alpha Beta Gamma Delta Co.';
    assert.equal(findingFor(crossCheck(docs), 'exporter').severity, 'low');
  });

  it('flags a name that gains a word as medium', () => {
    const docs = baseDocs();
    docs.certificate_of_origin.exporter = 'Example Export Shanghai Co Ltd';
    assert.equal(findingFor(crossCheck(docs), 'exporter').severity, 'medium');
  });
});

// --- missing data, input checks, report rules -------------------------------------------------

describe('crossCheck: missing data and input checks', () => {
  it('works with only two documents', () => {
    const docs = baseDocs();
    delete docs.certificate_of_origin;
    assert.deepEqual(crossCheck(docs).findings, []);
    assert.deepEqual(crossCheck(docs).summary.documentsCompared, [
      'commercial_invoice',
      'packing_list',
    ]);
  });

  it('says what it could not compare', () => {
    const report = crossCheck(baseDocs());
    assert.ok(report.summary.notCompared.some((n) => n.field === 'currency'));
  });

  it('does not call it consistent when nothing could be compared', () => {
    const report = crossCheck({ commercial_invoice: {}, packing_list: {} });
    assert.equal(report.summary.overall, 'not_enough_data');
    assert.equal(report.findings.length, 0);
  });

  it('rejects unusable input with a clear error', () => {
    const bad = [
      [null, /object keyed by document type/],
      [[], /object keyed by document type/],
      [{ commercial_invoice: {} }, /At least two documents/],
      [{ commercial_invoice: {}, invoice: {} }, /Unknown document type "invoice"/],
      [{ commercial_invoice: {}, packing_list: [] }, /packing_list must be an object/],
      [{ commercial_invoice: {}, packing_list: 'x' }, /packing_list must be an object/],
    ];
    for (const [input, pattern] of bad) {
      assert.throws(
        () => crossCheck(input),
        (err) => err instanceof CrossCheckInputError && pattern.test(err.message),
        JSON.stringify(input),
      );
    }
    assert.throws(() => crossCheck(baseDocs(), { tolerancePercent: -1 }), CrossCheckInputError);
  });

  it('lets the caller choose the tolerance', () => {
    const docs = baseDocs();
    docs.packing_list.grossWeight = '504 kg'; // 0.8% off
    assert.equal(crossCheck(docs).findings.length, 1);
    assert.equal(crossCheck(docs, { tolerancePercent: 5 }).findings.length, 0);
    assert.equal(crossCheck(docs).summary.tolerancePercent, 0.5);
  });

  it('never changes its input', () => {
    const docs = deepFreeze(loadFixture('demo-weight-mismatch'));
    assert.doesNotThrow(() => crossCheck(docs));
  });

  it('gives identical reports for identical input', () => {
    assert.deepEqual(
      crossCheck(loadFixture('demo-weight-mismatch')),
      crossCheck(loadFixture('demo-weight-mismatch')),
    );
  });
});

describe('crossCheck: severity and wording rules', () => {
  const planted = () => {
    const docs = baseDocs();
    docs.certificate_of_origin.originCountry = 'Pakistan'; // origin: high
    docs.packing_list.lines[0].quantity = 500; // quantity: high (50%)
    docs.commercial_invoice.freightCharges = 100; // itemized, so the total below is a real gap:
    docs.commercial_invoice.totalValue = 7000; // 6000 + 100 freight = 6100, not 7000. value: high
    docs.packing_list.grossWeight = '650 kg'; // weight: high
    docs.packing_list.exporter = 'Northern Steel Works'; // party: medium
    return docs;
  };

  it('sorts findings from most to least serious', () => {
    const order = ['critical', 'high', 'medium', 'low'];
    const ranks = crossCheck(planted()).findings.map((f) => order.indexOf(f.severity));
    assert.deepEqual(
      ranks,
      [...ranks].sort((a, b) => a - b),
    );
  });

  it('makes the overall result critical only when origin, quantity and value are all high', () => {
    const all = crossCheck(planted());
    assert.equal(all.summary.overall, 'critical');
    assert.equal(all.summary.multipleRiskIndicators, true);
    assert.ok(
      all.findings.every((f) => f.severity !== 'critical'),
      'individual findings are never escalated',
    );

    const docs = planted();
    delete docs.commercial_invoice.freightCharges;
    docs.commercial_invoice.totalValue = 6000; // value no longer high
    const two = crossCheck(docs);
    assert.equal(two.summary.overall, 'high');
  });

  it('counts findings by severity', () => {
    const { summary } = crossCheck(planted());
    assert.equal(summary.bySeverity.high, 4);
    assert.equal(summary.bySeverity.medium, 1);
    assert.equal(summary.findingCount, 5);
  });

  it('gives every finding a stable key and the fields a reviewer needs', () => {
    const { findings } = crossCheck(planted());
    assert.equal(new Set(findings.map((f) => f.key)).size, findings.length);
    for (const f of findings) {
      for (const field of [
        'key',
        'field',
        'category',
        'severity',
        'documents',
        'values',
        'explanation',
        'recommendedAction',
      ]) {
        assert.ok(f[field] !== undefined, `${f.key} is missing ${field}`);
      }
      assert.ok(f.documents.length >= 1);
    }
  });

  it('never uses accusatory wording and always asks for manual verification on medium and high findings', () => {
    const scenarios = [planted(), loadFixture('demo-weight-mismatch')];
    const unusual = baseDocs();
    unusual.packing_list.grossWeight = '12 tons';
    unusual.certificate_of_origin.originCountry = 'Atlantis';
    scenarios.push(unusual);

    for (const docs of scenarios) {
      const report = crossCheck(docs);
      const text = JSON.stringify(report);
      assert.doesNotMatch(text, /fraud|forg|fake|illegal|smuggl/i);
      for (const f of report.findings.filter((x) => x.severity !== 'low')) {
        assert.match(f.recommendedAction, /manual verification/, f.key);
      }
    }
    assert.match(crossCheck(planted()).summary.rules.note, /not conclusions about intent/);
  });
});
