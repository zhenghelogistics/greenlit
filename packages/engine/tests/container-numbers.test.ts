import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkContainerNumber, containerCheckDigit } from '../src/container-numbers.ts';

test('a real container number checks out', () => {
  // Off the Evergreen arrival notice this rule was written for.
  const r = checkContainerNumber('EITU3306045');
  assert.equal(r.wellFormed, true);
  assert.equal(r.checkDigitValid, true);
  assert.equal(r.problem, null);
});

test('one misread letter is caught', () => {
  // OCR read EITU3306045 as KITU3306045. One character, and the check digit
  // refuses it — which is the whole reason this exists. A wrong number is
  // caught where it is entered rather than at a gate with the box already on
  // the chassis.
  const r = checkContainerNumber('KITU3306045');
  assert.equal(r.wellFormed, true, 'the shape is fine, which is why shape alone is not enough');
  assert.equal(r.checkDigitValid, false);
  assert.match(String(r.problem), /does not check out/);
});

test('the message says which digit it expected', () => {
  // So somebody can look at the box and see where they went wrong, rather than
  // being told only that something is.
  const expected = containerCheckDigit('EITU330604');
  assert.equal(expected, 5);
  assert.match(String(checkContainerNumber('EITU3306040').problem), /should be 5/);
});

test('spaces and lower case are how people write it, not errors', () => {
  assert.equal(checkContainerNumber(' eitu 3306045 ').checkDigitValid, true);
  assert.equal(checkContainerNumber('eitu3306045').number, 'EITU3306045');
});

test('the wrong shape is said plainly, with an example', () => {
  // A controller who has typed nine characters needs to know what is expected,
  // not that a pattern did not match.
  assert.match(String(checkContainerNumber('EITU33060').problem), /four letters then seven digits/);
  assert.match(String(checkContainerNumber('EITU33060').problem), /EITU3306045/);
  assert.equal(checkContainerNumber('').problem, 'No container number.');
  assert.equal(checkContainerNumber(null).wellFormed, false);
});

test('nothing is corrected, only refused', () => {
  // A check digit says a number is wrong, never which character was misread.
  // Guessing would put a different wrong number on the job, and that one
  // would check out.
  const r = checkContainerNumber('KITU3306045');
  assert.equal(r.number, 'KITU3306045', 'returned as given, not repaired');
});

test('the letters skip the values ISO 6346 skips', () => {
  // 11, 22 and 33 are multiples of the modulus, so letters mapped to them
  // would be indistinguishable from each other. Getting this wrong makes the
  // rule reject perfectly good numbers, which is worse than not having it.
  assert.equal(checkContainerNumber('MSCU1234567').checkDigitValid, false);
  assert.equal(checkContainerNumber('CSQU3054383').checkDigitValid, true, 'the ISO example');
});
