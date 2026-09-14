import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentProblem, storagePathFor, suggestedDocumentType } from '../src/documents.ts';

test('§10: a file type is suggested from the real names carriers use', () => {
  // Every one of these is a file operations actually sent.
  assert.equal(suggestedDocumentType('AN_BKKGT3057700 - ONE.pdf'), 'ARRIVAL_NOTICE');
  assert.equal(suggestedDocumentType('Arrival Notice - S2604100912 -DHL.PDF'), 'ARRIVAL_NOTICE');
  assert.equal(suggestedDocumentType('NOA - MAERSK.pdf'), 'ARRIVAL_NOTICE');
  assert.equal(suggestedDocumentType('ISLAND - CONF . SGLCHCAE3796.pdf'), 'BOOKING_CONFIRMATION');
  assert.equal(suggestedDocumentType('ZHL_ZHL-074-26_PickupOrder.pdf'), 'DELIVERY_ORDER');
});

test('§10: an unrecognisable name is Other, not a guess', () => {
  // "DB9DCNCT1.PDF" is a real Evergreen filename and is not obviously
  // anything. Offering a wrong type confidently is worse than offering none.
  assert.equal(suggestedDocumentType('DB9DCNCT1.PDF'), 'OTHER');
  assert.equal(suggestedDocumentType('scan001.pdf'), 'OTHER');
});

test('§10: a stored path cannot invent a folder', () => {
  // A carrier's filename can contain a slash, and a slash would make the file
  // land somewhere nobody looks for it.
  const path = storagePathFor('job-1', 1, 'ARRIVAL/NOTICE 2026.pdf');
  assert.equal(path, 'job-1/v1-ARRIVAL_NOTICE_2026.pdf');
  assert.equal(path.split('/').length, 2, 'one folder, the job');
});

test('§10: a corrected notice cannot overwrite the one the job was worked from', () => {
  const first = storagePathFor('job-1', 1, 'noa.pdf');
  const second = storagePathFor('job-1', 2, 'noa.pdf');
  assert.notEqual(first, second);
});

test('§10: a very long filename is truncated rather than refused', () => {
  const long = `${'x'.repeat(400)}.pdf`;
  const path = storagePathFor('job-1', 1, long);
  assert.ok(path.length < 200, 'storage keys have limits');
  assert.match(path, /^job-1\/v1-/);
});

test('§10: a file with no name cannot be found again', () => {
  assert.match(documentProblem({ filename: '  ' }) ?? '', /needs a name/);
  assert.equal(documentProblem({ filename: 'noa.pdf' }), null);
  assert.match(documentProblem({ filename: 'a.pdf', documentType: 'INVENTED' }) ?? '',
    /not a document type/);
});
