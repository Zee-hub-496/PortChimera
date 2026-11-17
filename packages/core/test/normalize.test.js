import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  descriptionTokens,
  nameTokens,
  normalizeCountry,
  normalizeCurrency,
  normalizeDate,
  normalizeIdentifier,
  normalizeUnit,
  parseNumber,
  parseWeight,
  toKg,
  tokenOverlap,
} from '../src/crosscheck/normalize.js';

describe('parseNumber', () => {
  it('reads plain numbers and numeric strings', () => {
    assert.equal(parseNumber(12.5), 12.5);
    assert.equal(parseNumber('500'), 500);
    assert.equal(parseNumber(' 42 '), 42);
    assert.equal(parseNumber('-7.5'), -7.5);
  });

  it('reads different thousands and decimal conventions', () => {
    assert.equal(parseNumber('1,234.56'), 1234.56);
    assert.equal(parseNumber('1.234,56'), 1234.56);
    assert.equal(parseNumber('1 234,5'), 1234.5);
    assert.equal(parseNumber('1,234'), 1234);
    assert.equal(parseNumber('1,5'), 1.5);
    assert.equal(parseNumber('1.234.567'), 1234567);
    assert.equal(parseNumber('12,345,678'), 12345678);
  });

  it('ignores currency symbols', () => {
    assert.equal(parseNumber('$1,200'), 1200);
    assert.equal(parseNumber('€ 99.90'), 99.9);
  });

  it('returns null for anything that is not a plain number', () => {
    for (const bad of [
      'abc',
      '12 kg',
      'USD 100',
      '',
      '   ',
      null,
      undefined,
      NaN,
      Infinity,
      {},
      [],
      '--',
    ]) {
      assert.equal(parseNumber(bad), null, String(bad));
    }
  });
});

describe('toKg and parseWeight', () => {
  it('converts the supported units', () => {
    assert.equal(toKg(500, 'kg'), 500);
    assert.equal(toKg('500,000', 'g'), 500);
    assert.equal(toKg(2, 'tonnes'), 2000);
    assert.equal(toKg(1000, 'lbs'), 453.59237);
    assert.equal(toKg(5, 'KGS'), 5);
    assert.equal(toKg(5, 'Kg.'), 5);
  });

  it('refuses unit names that would be guesses', () => {
    assert.equal(toKg(1, 'ton'), null); // short, long or metric? we do not guess
    assert.equal(toKg(1, 'tons'), null);
    assert.equal(toKg(1, 'furlong'), null);
    assert.equal(toKg(1, ''), null);
    assert.equal(toKg('x', 'kg'), null);
  });

  it('reads weights given as text or as objects', () => {
    assert.deepEqual(parseWeight('500 kg'), { kg: 500, raw: '500 kg' });
    assert.equal(parseWeight('500kg').kg, 500);
    assert.equal(parseWeight('1,200.5 KGS').kg, 1200.5);
    assert.equal(parseWeight({ value: '650', unit: 'kg' }).kg, 650);
    assert.equal(parseWeight({ value: 500000, unit: 'g' }).kg, 500);
  });

  it('returns null when nothing was provided', () => {
    assert.equal(parseWeight(null), null);
    assert.equal(parseWeight(undefined), null);
    assert.equal(parseWeight(''), null);
  });

  it('explains why a weight cannot be used', () => {
    assert.equal(parseWeight('12 tons').reason, 'unrecognized_unit');
    assert.equal(parseWeight(500).reason, 'missing_unit');
    assert.equal(parseWeight({ value: 500 }).reason, 'missing_unit');
    assert.equal(parseWeight('heavy').reason, 'unreadable');
    assert.equal(parseWeight({ value: 'abc', unit: 'kg' }).reason, 'unreadable');
    for (const w of [parseWeight('12 tons'), parseWeight(500), parseWeight('heavy')]) {
      assert.equal(w.kg, null);
    }
  });
});

describe('normalizeUnit', () => {
  it('groups common spellings of the same unit', () => {
    for (const u of ['pcs', 'PCS', 'Pieces', 'units', 'nos', 'each'])
      assert.equal(normalizeUnit(u), 'unit', u);
    for (const u of ['ctn', 'Cartons']) assert.equal(normalizeUnit(u), 'carton', u);
    assert.equal(normalizeUnit('KGS'), 'kg');
  });

  it('keeps different units different', () => {
    assert.notEqual(normalizeUnit('carton'), normalizeUnit('box'));
  });

  it('keeps unknown units as lowercase text and returns null for blanks', () => {
    assert.equal(normalizeUnit('Drums'), 'drums');
    assert.equal(normalizeUnit(''), null);
    assert.equal(normalizeUnit(null), null);
  });
});

describe('names and descriptions', () => {
  it('treats legal suffixes and punctuation as formatting', () => {
    const a = nameTokens('ABC Trading Co., Ltd.');
    const b = nameTokens('abc trading company limited');
    const c = nameTokens('A.B.C. Trading Pvt. Ltd');
    assert.deepEqual(a, ['abc', 'trading']);
    assert.deepEqual(b, ['abc', 'trading']);
    assert.deepEqual(c, ['abc', 'trading']); // dots are removed first, so initials like "A.B.C." match "ABC"
  });

  it('treats "&" and "and" the same', () => {
    assert.deepEqual(nameTokens('Smith & Sons Ltd'), nameTokens('Smith and Sons Limited'));
  });

  it('keeps tokens of a name made only of suffixes', () => {
    assert.deepEqual(nameTokens('Co Ltd'), ['co', 'ltd']);
  });

  it('handles missing names', () => {
    assert.deepEqual(nameTokens(undefined), []);
    assert.deepEqual(nameTokens(null), []);
  });

  it('measures overlap between word lists', () => {
    assert.equal(tokenOverlap(['a', 'b'], ['a', 'b']), 1);
    assert.equal(tokenOverlap(['a', 'b'], ['c', 'd']), 0);
    assert.equal(tokenOverlap(['a', 'b'], ['b', 'c']), 1 / 3);
    assert.equal(tokenOverlap([], ['a']), 0);
    assert.equal(tokenOverlap(['a', 'a'], ['a']), 1);
  });

  it('compares descriptions ignoring case, plurals and filler words', () => {
    const a = descriptionTokens('Men’s Cotton T-Shirts');
    const b = descriptionTokens("men's cotton t-shirt");
    assert.equal(tokenOverlap(a, b), 1);
    assert.ok(
      tokenOverlap(descriptionTokens('Cotton shirts'), descriptionTokens('Steel pipes')) < 0.3,
    );
  });
});

describe('identifiers, currencies, countries', () => {
  it('ignores case and separators in identifiers but keeps leading zeros', () => {
    assert.equal(normalizeIdentifier('inv-1001'), 'INV1001');
    assert.equal(normalizeIdentifier('INV 1001'), 'INV1001');
    assert.equal(normalizeIdentifier('INV/1001'), 'INV1001');
    assert.notEqual(normalizeIdentifier('INV-0012'), normalizeIdentifier('INV-12'));
    assert.equal(normalizeIdentifier('---'), null);
    assert.equal(normalizeIdentifier(null), null);
  });

  it('normalizes currency codes', () => {
    assert.equal(normalizeCurrency(' usd '), 'USD');
    assert.equal(normalizeCurrency('US$'), 'USD');
    assert.equal(normalizeCurrency('RMB'), 'CNY');
    assert.equal(normalizeCurrency(''), null);
    assert.equal(normalizeCurrency(5), null);
  });

  it('recognizes one country written many ways', () => {
    for (const text of [
      'CN',
      'cn',
      'China',
      "People's Republic of China",
      'PRC',
      'Made in China',
      'Country of Origin: China',
    ]) {
      assert.equal(normalizeCountry(text).code, 'CN', text);
    }
    assert.equal(normalizeCountry('Pakistan').code, 'PK');
    assert.equal(normalizeCountry('U.A.E.').code, 'AE');
    assert.notEqual(normalizeCountry('China').code, normalizeCountry('Pakistan').code);
  });

  it('keeps the text of countries it does not recognize, with no code', () => {
    assert.deepEqual(normalizeCountry('Atlantis'), { code: null, text: 'atlantis' });
    assert.equal(normalizeCountry(''), null);
    assert.equal(normalizeCountry(undefined), null);
  });
});

describe('normalizeDate', () => {
  it('reads common formats into ISO', () => {
    for (const text of [
      '2026-11-17',
      '17/11/2026',
      '17.11.2026',
      '17 Nov 2026',
      'November 17, 2026',
      '17th November 2026',
      '2026/11/17',
    ]) {
      assert.equal(normalizeDate(text), '2026-11-17', text);
    }
  });

  it('handles ambiguous numeric dates day-first by default, month-first on request', () => {
    assert.equal(normalizeDate('03/04/2026'), '2026-04-03');
    assert.equal(normalizeDate('03/04/2026', { dayFirst: false }), '2026-03-04');
  });

  it('uses the only valid reading when one part exceeds 12', () => {
    assert.equal(normalizeDate('11/17/2026'), '2026-11-17');
    assert.equal(normalizeDate('17/11/2026', { dayFirst: false }), '2026-11-17');
  });

  it('reads two-digit years as 20xx', () => {
    assert.equal(normalizeDate('17/11/26'), '2026-11-17');
  });

  it('rejects impossible and unreadable dates', () => {
    for (const bad of ['2026-02-30', '31/04/2026', '2026-13-01', 'yesterday', '', null, 42]) {
      assert.equal(normalizeDate(bad), null, String(bad));
    }
  });

  it('accepts a real leap day and rejects a fake one', () => {
    assert.equal(normalizeDate('2028-02-29'), '2028-02-29');
    assert.equal(normalizeDate('2026-02-29'), null);
  });
});
