import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YARDS, YARD_SITES, matchYard, yardLabel } from '../src/yards.ts';

test('every yard operations listed is here', () => {
  assert.equal(YARDS.length, 15);
  const names = YARDS.map((y) => y.name).sort();
  assert.ok(names.includes('Allied Yard'));
  assert.ok(names.includes('Eng Kong Yard'));
  assert.ok(names.includes('PSA'));
});

test('the three yards with several depots have them all', () => {
  // These are the ones worth getting right. "Allied" is four addresses and a
  // driver can only go to one of them.
  const sites = (code: string) => YARDS.find((y) => y.code === code)!.sites.length;
  assert.equal(sites('A'), 4, 'Allied');
  assert.equal(sites('CWT'), 3, 'CWT');
  assert.equal(sites('EK'), 4, 'Eng Kong');
});

test('a gate is found by every name it goes by', () => {
  // TBL1 and ALLIED 1 are the same gate at 1 Tuas Basin Lane. The carrier
  // list already sends KMTC reefers to TBL1, so both spellings have to land.
  assert.equal(matchYard('TBL1')?.site.code, 'ALLIED 1');
  assert.equal(matchYard('TBL 1')?.site.code, 'ALLIED 1');
  assert.equal(matchYard('ALLIED 1')?.site.code, 'ALLIED 1');
  assert.equal(matchYard('1 Tuas Basin Lane, Singapore 637066')?.site.code, 'ALLIED 1');
});

test('a gate is not answered by its yard', () => {
  // "CWT" is inside "CWT1", and CWT Jalan Buroh is twenty minutes from CWT
  // Tuas. Answering the yard when the document named the gate throws away the
  // only detail that mattered.
  assert.equal(matchYard('CWT1')?.site.code, 'CWTJB');
  assert.equal(matchYard('CWTTUAS')?.site.code, 'CWTTUAS');
  assert.equal(matchYard('CWT3')?.site.code, 'CWTPNR');
  assert.equal(matchYard('22 Pioneer Sector 2')?.site.code, 'CWTPNR');
});

test('Eng Kong’s four gates are told apart', () => {
  assert.equal(matchYard('EK 13')?.site.code, 'EK 13');
  assert.equal(matchYard('EK PNR')?.site.code, 'EK PNR');
  assert.equal(matchYard('8A Tuas Avenue 13')?.site.code, 'EK 13');
  assert.equal(matchYard('15 Tuas Avenue 11')?.site.code, 'EK 11');
});

test('punctuation and case do not decide the answer', () => {
  // A notice writes an address however the carrier's system writes it.
  assert.equal(matchYard('eng kong 13')?.site.code, 'EK 13');
  assert.equal(matchYard('ALLIED-1')?.site.code, 'ALLIED 1');
  assert.equal(matchYard('  cwtjb  ')?.site.code, 'CWTJB');
});

test('a name that lands on four gates is null, not one of the four', () => {
  // "Eng Kong" is four depots. Answering with whichever one sorted first is a
  // coin flip with a container on it, and the field is corrected by hand
  // anyway — so it is left empty and somebody chooses.
  assert.equal(matchYard('ENG KONG'), null);
  assert.equal(matchYard('CWT YARD'), null);
  // Allied has four gates too, and the notice named one of them.
  assert.equal(matchYard('ALLIED 5')?.site.code, 'ALLIED 5');
});

test('a two-letter code still finds its yard', () => {
  // Container Connection's code is two letters. It is too short to go looking
  // for inside a sentence, but a document that writes it on its own has named
  // the yard as plainly as any other.
  assert.equal(matchYard('CC')?.yard.code, 'CC');
  // Allied's code is one letter and four gates. Still a coin flip.
  assert.equal(matchYard('A'), null);
});

test('a name written into a sentence is still found', () => {
  // A notice does not print the yard on its own line; it prints it in a
  // sentence, in whatever words the carrier's system uses.
  assert.equal(matchYard('EMPTY RETURN TO CWT TUAS')?.site.code, 'CWTTUAS');
  assert.equal(matchYard('Return depot: ENG KONG 11, by 25 Sep')?.site.code, 'EK 11');
});

test('a yard nobody has heard of is null, not a guess', () => {
  // Operations still correct this by hand. A wrong yard is a driver sent
  // twenty minutes the wrong way, which is worse than an empty field.
  assert.equal(matchYard('SOME DEPOT NOBODY USES'), null);
  assert.equal(matchYard(''), null);
  assert.equal(matchYard(null), null);
});

test('a yard with no address yet is still a yard', () => {
  // Most of these have no address, and operations will fill them in. The
  // matching gets better when one arrives; the depot exists either way.
  const withoutAddress = YARD_SITES.filter(({ site }) => site.address === null);
  assert.ok(withoutAddress.length > 8, 'expected most yards to be awaiting an address');
  assert.equal(matchYard('Cogent')?.yard.code, 'CGC');
  assert.equal(matchYard('Master Faith')?.yard.code, 'MASTERFAITH');
});

test('a yard with one gate is named plainly; one with several says which', () => {
  const psa = YARDS.find((y) => y.code === 'PSA')!;
  assert.equal(yardLabel(psa, psa.sites[0]!), 'PSA');

  const allied = YARDS.find((y) => y.code === 'A')!;
  assert.equal(yardLabel(allied, allied.sites[0]!), 'Allied Yard — ALLIED 1');
});

test('no rates are modelled', () => {
  // Operations were explicit that yard rates belong to billing, and this
  // application does not do billing. A rate here would be a number nobody
  // maintains, read by nothing, wrong by the time it mattered.
  const asText = JSON.stringify(YARDS);
  assert.doesNotMatch(asText, /rate|price|charge|\$/i);
});
