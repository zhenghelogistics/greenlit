import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_WORDS, fieldWords, missingInWords } from '../src/field-words.ts';

// The two sets every gate reports against. Kept here rather than imported,
// because @greenlit/core depends on the engine and not the other way round —
// and because a copy that drifts is exactly what the last test catches.
const IMPORT_MANDATORY = [
  'customer', 'blNumber', 'vesselName', 'voyageNumber', 'eta', 'deliveryAddress'];
const EXPORT_MANDATORY = [
  'customer', 'shipper', 'bookingReference', 'exportClearanceReference',
  'vesselName', 'voyageNumber', 'etaSingapore', 'emptyCollectionYard',
  'containerQuantity', 'containerSizeType', 'truckInDate', 'truckOutDate'];

test('every mandatory field has words a person would use', () => {
  // The defect this closes: a blocked export job told a controller it needed
  // "truckInDate, truckOutDate" — two words that appear nowhere in the
  // operation, on the screen whose whole job is to say what to do next.
  const untranslated = [...IMPORT_MANDATORY, ...EXPORT_MANDATORY]
    .filter((field) => !(field in FIELD_WORDS));
  assert.deepEqual(untranslated, [],
    'these fields would be shown to a controller as raw property names');
});

test('no translation is itself an identifier', () => {
  // A table that maps camelCase to the same camelCase is worse than no table:
  // it looks handled and reads exactly as badly.
  const stillCamel = Object.entries(FIELD_WORDS)
    .filter(([, words]) => /[a-z][A-Z]/.test(words))
    .map(([field]) => field);
  assert.deepEqual(stillCamel, []);
});

test('an unknown field falls back to its identifier rather than vanishing', () => {
  // Ugly on screen, which is the point: a gate that blocks a job for no
  // stated reason is worse than one that states it awkwardly.
  assert.equal(fieldWords('somethingNobodyMapped'), 'somethingNobodyMapped');
  assert.equal(fieldWords('truckInDate'), 'date the container goes into the yard');
});

test('a list of missing fields reads as a sentence', () => {
  assert.equal(missingInWords([]), '');
  assert.equal(missingInWords(['customer']), 'customer');
  assert.equal(missingInWords(['customer', 'shipper']), 'customer and shipper');
  assert.equal(missingInWords(['truckInDate', 'truckOutDate']),
    'date the container goes into the yard and date the container leaves the yard');
});
