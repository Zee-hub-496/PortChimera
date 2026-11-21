import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResponseSchema, fieldResponseSchema } from '../../src/ai/responseSchema.js';
import { DOCUMENT_FIELDS, FIELD_STATUSES } from '../../src/ai/fieldNames.js';
import { describeIssue } from '../../src/ai/validationIssue.js';

const types = Object.keys(DOCUMENT_FIELDS);

test('top-level and line keys match DOCUMENT_FIELDS exactly for every type', () => {
  for (const type of types) {
    const def = DOCUMENT_FIELDS[type];
    const schema = buildResponseSchema(type);
    assert.deepEqual(Object.keys(schema.properties.fields.properties), def.fields);
    const required = def.fields.filter((f) => !def.optional.includes(f));
    assert.deepEqual(schema.properties.fields.required, required);
    if (def.lineFields.length > 0) {
      const items = schema.properties.lines.items;
      assert.deepEqual(Object.keys(items.properties), def.lineFields);
      assert.deepEqual(items.required, def.lineFields);
      assert.deepEqual(schema.required, ['fields', 'lines']);
    } else {
      assert.equal(schema.properties.lines, undefined);
      assert.deepEqual(schema.required, ['fields']);
    }
  }
});

test('invoice total weights are optional, not required', () => {
  const { fields } = buildResponseSchema('commercial_invoice').properties;
  assert.ok('total_gross_weight' in fields.properties);
  assert.ok('total_net_weight' in fields.properties);
  assert.ok(!fields.required.includes('total_gross_weight'));
  assert.ok(!fields.required.includes('total_net_weight'));
});

test('a field is value, confidence 0 to 1, status enum and nullable evidence, all required', () => {
  const f = fieldResponseSchema();
  assert.deepEqual(f.required, ['value', 'confidence', 'status', 'evidence']);
  assert.deepEqual(f.properties.status.enum, [...FIELD_STATUSES]);
  assert.equal(f.properties.confidence.minimum, 0);
  assert.equal(f.properties.confidence.maximum, 1);
  assert.equal(f.properties.value.nullable, true);
  assert.deepEqual(
    f.properties.value.anyOf.map((s) => s.type),
    ['STRING', 'NUMBER'],
  );
  assert.equal(f.properties.evidence.nullable, true);
});

test('the schema uses only types from the Gemini Schema subset (no additionalProperties)', () => {
  const json = JSON.stringify(buildResponseSchema('commercial_invoice'));
  assert.ok(!json.includes('additionalProperties'));
  assert.ok(!json.includes('$ref'));
});

test('an unknown document type throws', () => {
  assert.throws(() => buildResponseSchema('bill_of_lading'), /Unknown document type/);
});

test('describeIssue gives path and code, and never a value', () => {
  assert.equal(
    describeIssue({ path: ['fields'], code: 'unrecognized_keys', keys: ['total_volume'] }),
    'fields: unrecognized_keys (total_volume)',
  );
  assert.equal(
    describeIssue({ path: ['lines', 0, 'name', 'value'], code: 'invalid_type' }),
    'lines.[].name.value: invalid_type',
  );
  assert.equal(describeIssue({ path: [], code: 'invalid_type' }), 'root: invalid_type');
  const odd = describeIssue({
    path: ['fields'],
    code: 'unrecognized_keys',
    keys: ['Invoice total is 10500 EUR to ACME Ltd'],
  });
  assert.equal(odd, 'fields: unrecognized_keys');
  assert.equal(describeIssue(undefined), 'root: invalid');
});
