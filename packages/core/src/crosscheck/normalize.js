// Normalization: turns messy document text into comparable values.
//
// The rule behind this file: two documents that say the same thing in different formatting
// ("500 KG" and "500,000 g", "ABC Trading Co., Ltd." and "abc trading company limited") must
// compare as EQUAL. Only real differences should reach the report.

const round6 = (n) => Math.round(n * 1e6) / 1e6;

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/**
 * Reads a number from a number or a string such as "1,234.56", "1.234,56", "1 234,5" or "$1,200".
 * Returns null when the text is not a plain number (for example it contains letters).
 *
 * Ambiguity, decided on purpose: "1,234" is read as 1234 (thousands separator) and "1,5" as 1.5.
 * "1.234" is read as 1.234 (decimal point). Documents that need other conventions should be
 * corrected in the review step before they reach the cross-checker.
 */
export function parseNumber(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string') return null;
  if (/[A-Za-z]/.test(input)) return null;

  let s = input.replace(/[^\d.,\-\s]/g, '').replace(/\s+/g, '');
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Both appear: whichever comes last is the decimal separator.
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma !== -1) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot !== -1 && s.indexOf('.') !== lastDot) {
    s = s.replace(/\./g, ''); // "1.234.567" can only be thousands separators
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const KG_PER_UNIT = {
  kg: 1,
  kgs: 1,
  kilo: 1,
  kilos: 1,
  kilogram: 1,
  kilograms: 1,
  g: 0.001,
  gm: 0.001,
  gms: 0.001,
  gram: 0.001,
  grams: 0.001,
  lb: 0.45359237,
  lbs: 0.45359237,
  pound: 0.45359237,
  pounds: 0.45359237,
  t: 1000,
  mt: 1000,
  tonne: 1000,
  tonnes: 1000,
  'metric ton': 1000,
  'metric tons': 1000,
};
// "ton" and "tons" are deliberately NOT listed: a short ton (907 kg), a long ton (1,016 kg) and
// a metric tonne (1,000 kg) differ by up to 10%. Guessing would create false results.

const cleanUnit = (unit) =>
  String(unit ?? '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');

/** Kilograms per one `unit`, or null when the unit is not recognized. */
export function weightUnitFactor(unit) {
  const factor = KG_PER_UNIT[cleanUnit(unit)];
  return factor === undefined ? null : factor;
}

/** Converts a value in a weight unit to kilograms. Returns null if the value or unit is not understood. */
export function toKg(value, unit) {
  const n = parseNumber(value);
  const factor = weightUnitFactor(unit);
  return n === null || factor === null ? null : round6(n * factor);
}

/**
 * Reads a weight given as `{ value, unit }` or as text such as "500 kg".
 * Returns null when nothing was provided. Otherwise `{ kg, raw }`, where kg is null and
 * `reason` is set when the weight cannot be compared: 'unreadable', 'unrecognized_unit' or 'missing_unit'.
 */
export function parseWeight(input) {
  if (input === null || input === undefined || input === '') return null;

  let valueRaw;
  let unitRaw;
  if (typeof input === 'object') {
    valueRaw = input.value;
    unitRaw = input.unit;
  } else if (typeof input === 'string') {
    const m = input.trim().match(/^(-?[\d.,\s]*\d)\s*([A-Za-z][A-Za-z. ]*)$/);
    if (!m) return { kg: null, raw: input, reason: 'unreadable' };
    [, valueRaw, unitRaw] = m;
  } else {
    valueRaw = input;
  }

  const raw = `${valueRaw ?? ''} ${unitRaw ?? ''}`.trim();
  if (parseNumber(valueRaw) === null) return { kg: null, raw, reason: 'unreadable' };
  if (!unitRaw) return { kg: null, raw, reason: 'missing_unit' };
  const kg = toKg(valueRaw, unitRaw);
  return kg === null ? { kg: null, raw, reason: 'unrecognized_unit' } : { kg, raw };
}

// ---------------------------------------------------------------------------
// Quantity units
// ---------------------------------------------------------------------------

const UNIT_ALIASES = new Map(
  Object.entries({
    unit: ['unit', 'units', 'pc', 'pcs', 'piece', 'pieces', 'no', 'nos', 'ea', 'each', 'number'],
    carton: ['carton', 'cartons', 'ctn', 'ctns'],
    box: ['box', 'boxes'],
    pallet: ['pallet', 'pallets', 'plt', 'plts'],
    set: ['set', 'sets'],
    pair: ['pair', 'pairs', 'prs'],
    kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'],
    m: ['m', 'meter', 'meters', 'metre', 'metres', 'mtr'],
    l: ['l', 'litre', 'litres', 'liter', 'liters', 'ltr'],
  }).flatMap(([canonical, names]) => names.map((name) => [name, canonical])),
);

const COUNT_UNITS = new Set(['unit', 'carton', 'box', 'pallet', 'set', 'pair']);

/** For display only: "unit" becomes "units" and so on. Measures such as "kg" are left alone. */
export function displayUnit(unit) {
  if (!unit) return '';
  return COUNT_UNITS.has(unit) ? `${unit}s` : unit;
}

/** "PCS", "pieces" and "units" all become "unit"; unknown units are kept as lowercase text. */
export function normalizeUnit(unit) {
  const cleaned = cleanUnit(unit);
  if (cleaned === '') return null;
  return UNIT_ALIASES.get(cleaned) ?? cleaned;
}

// ---------------------------------------------------------------------------
// Names and descriptions
// ---------------------------------------------------------------------------

const LEGAL_SUFFIXES = new Set([
  'ltd', 'limited', 'llc', 'inc', 'incorporated', 'co', 'corp', 'corporation', 'company',
  'pvt', 'private', 'plc', 'gmbh', 'sa', 'bv', 'sdn', 'bhd', 'pte', 'llp', 'lp', 'ag', 'srl',
]); // prettier-ignore
const NAME_STOP_WORDS = new Set(['the', 'and', 'of']);

/** Lowercase words of a company name, without punctuation or legal suffixes (Ltd, LLC, Co ...). */
export function nameTokens(name) {
  if (typeof name !== 'string') return [];
  const tokens = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\./g, '') // "L.L.C." -> "llc"
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const kept = tokens.filter((t) => !LEGAL_SUFFIXES.has(t) && !NAME_STOP_WORDS.has(t));
  return kept.length > 0 ? kept : tokens; // a name made only of suffixes keeps them
}

const DESCRIPTION_STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'and',
  'for',
  'with',
  'in',
  'to',
  'type',
]);

/** Lowercase content words of a product description, with a light plural fix ("shirts" -> "shirt"). */
export function descriptionTokens(text) {
  if (typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && !DESCRIPTION_STOP_WORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

/** Overlap between two word lists: shared words divided by all distinct words (0 to 1). */
export function tokenOverlap(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

// ---------------------------------------------------------------------------
// Identifiers, currencies, countries
// ---------------------------------------------------------------------------

/** "inv-1001", "INV 1001" and "INV/1001" all become "INV1001". Leading zeros are kept on purpose. */
export function normalizeIdentifier(value) {
  if (value === null || value === undefined) return null;
  const s = String(value)
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  return s === '' ? null : s;
}

const CURRENCY_ALIASES = { US$: 'USD', RMB: 'CNY', EURO: 'EUR', EUROS: 'EUR' };

export function normalizeCurrency(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().toUpperCase();
  if (s === '') return null;
  return CURRENCY_ALIASES[s] ?? s;
}

const COUNTRY_NAMES = {
  AE: ['uae', 'united arab emirates', 'emirates'],
  AU: ['australia'],
  BD: ['bangladesh'],
  BE: ['belgium'],
  BH: ['bahrain'],
  BR: ['brazil'],
  CA: ['canada'],
  CN: ['china', 'prc', 'peoples republic of china', 'mainland china'],
  DE: ['germany'],
  DJ: ['djibouti'],
  EG: ['egypt'],
  ES: ['spain'],
  FR: ['france'],
  GB: ['uk', 'united kingdom', 'great britain', 'britain', 'england'],
  GR: ['greece'],
  HK: ['hong kong', 'hongkong'],
  ID: ['indonesia'],
  IN: ['india'],
  IT: ['italy'],
  JP: ['japan'],
  KR: ['south korea', 'korea', 'republic of korea', 'korea republic of'],
  KW: ['kuwait'],
  LK: ['sri lanka'],
  MX: ['mexico'],
  MY: ['malaysia'],
  NL: ['netherlands', 'holland', 'the netherlands'],
  OM: ['oman'],
  PK: ['pakistan'],
  QA: ['qatar'],
  SA: ['saudi arabia', 'ksa'],
  SG: ['singapore'],
  TH: ['thailand'],
  TR: ['turkey', 'turkiye'],
  TW: ['taiwan'],
  US: ['usa', 'united states', 'united states of america', 'america'],
  VN: ['vietnam', 'viet nam'],
  ZA: ['south africa'],
};

const COUNTRY_LOOKUP = new Map();
for (const [code, names] of Object.entries(COUNTRY_NAMES)) {
  COUNTRY_LOOKUP.set(code.toLowerCase(), code);
  for (const name of names) COUNTRY_LOOKUP.set(name, code);
}

/**
 * Reads a country written as a code ("CN"), a name ("China") or a phrase ("Made in China").
 * Returns `{ code, text }`. `code` is a two-letter code, or null when the country is not in our
 * list. That matters: two different words we do not recognize are less certain to be a real
 * conflict than two different recognized countries.
 */
export function normalizeCountry(value) {
  if (typeof value !== 'string') return null;
  const text = value
    .toLowerCase()
    .replace(/^(made in|product of|produce of|country of origin:?|origin:?)\s+/, '')
    .replace(/['’.]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text === '') return null;
  return { code: COUNTRY_LOOKUP.get(text) ?? null, text };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}; // prettier-ignore

function isoDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const real =
    d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  if (!real) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Turns a date written in common formats into "YYYY-MM-DD", or null if it is not a real date.
 * Numeric dates like 03/04/2026 are ambiguous; they are read day-first unless `dayFirst` is false,
 * except when one part is larger than 12 (then there is only one valid reading).
 */
export function normalizeDate(input, { dayFirst = true } = {}) {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/,/g, '');

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (a > 12) return isoDate(year, b, a);
    if (b > 12) return isoDate(year, a, b);
    return dayFirst ? isoDate(year, b, a) : isoDate(year, a, b);
  }

  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()])
    return isoDate(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));

  m = s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()])
    return isoDate(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));

  return null;
}
