import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkChassisAvailability, chassisDays, chassisStatus, detectChassisExceptions,
  fleetAvailability, isChassisSizeValid, jobChassisDays, monthlyCapacity,
  applyChassisChange, recordChassisChange, validateChassisChange,
  type Chassis, type ChassisHolding,
} from '../src/chassis.ts';

const TODAY = '2026-09-01';
const unit = (o: Partial<Chassis> = {}): Chassis => ({
  chassisId: 'CH-4029', chassisNo: '4029', plateNo: 'TRA7727Y', size: '40FT',
  unladenWeightKg: 4200, maxGrossWeightKg: 41000, inspectionDueDate: null,
  manualStatus: null, active: true, ...o,
});
const hold = (o: Partial<ChassisHolding> = {}): ChassisHolding => ({
  chassisId: 'CH-4029', containerId: 'c1', jobId: 'j1',
  mountedAt: '2026-08-25T00:00:00Z', releasedAt: null, doubleMountedWith: null, ...o,
});

test('§35.2: a 40ft container needs a 40ft chassis', () => {
  assert.equal(isChassisSizeValid('40 HQ', '40FT').valid, true);
  assert.equal(isChassisSizeValid('40 HQ', '20FT').valid, false);
});

test('§35.2: a 20ft container needs a 20ft chassis, unless double mounted', () => {
  assert.equal(isChassisSizeValid('20 GP', '20FT').valid, true);
  assert.equal(isChassisSizeValid('20 GP', '40FT').valid, false,
    'the rule is not absolute, but it is not free either');
  assert.equal(isChassisSizeValid('20 GP', '40FT', true).valid, true,
    'two 20ft containers may share one 40ft chassis');
});

test('§35.3: status is derived from job records, never typed', () => {
  assert.equal(chassisStatus(unit(), [], TODAY), 'AVAILABLE');
  assert.equal(chassisStatus(unit(), [hold()], TODAY), 'IN_USE');
  assert.equal(chassisStatus(unit(), [hold({ releasedAt: '2026-08-30T00:00:00Z' })], TODAY),
    'AVAILABLE', 'released means available again, with no flag to clear');
});

test('§35.3: inspection and manual states take precedence', () => {
  assert.equal(chassisStatus(unit({ inspectionDueDate: '2026-08-01' }), [], TODAY), 'INSPECTION');
  assert.equal(chassisStatus(unit({ manualStatus: 'MAINTENANCE' }), [], TODAY), 'MAINTENANCE');
  assert.equal(chassisStatus(unit({ manualStatus: 'MAINTENANCE' }), [hold()], TODAY), 'IN_USE',
    '§35.8: a container on a unit withdrawn for maintenance is an exception, not a hidden container');
  assert.equal(chassisStatus(unit({ active: false }), [], TODAY), 'RETIRED');
  assert.equal(chassisStatus(unit({ inspectionDueDate: '2026-08-01' }), [hold()], TODAY),
    'IN_USE', 'a unit under a container is in use whatever else is true');
});

test('§35.4: availability is reported per size', () => {
  const fleet = [
    unit({ chassisId: 'a', size: '20FT' }),
    unit({ chassisId: 'b', size: '20FT' }),
    unit({ chassisId: 'c', size: '40FT' }),
  ];
  const a = fleetAvailability(fleet, [hold({ chassisId: 'a' })], TODAY);
  assert.equal(a.available20ft, 1);
  assert.equal(a.inUse20ft, 1);
  assert.equal(a.available40ft, 1);
});

test('§35.6: spare 40ft units are conditionally, not ordinarily, 20ft capacity', () => {
  const fleet = [unit({ chassisId: 'c', size: '40FT' })];
  const a = fleetAvailability(fleet, [], TODAY);
  assert.equal(a.available20ft, 0, 'must never be counted as plain 20ft capacity');
  assert.equal(a.conditionally20ftFrom40ft, 1, 'but it is reported as conditionally available');
});

test('§35.4: unavailability warns and never blocks', () => {
  const none = fleetAvailability([unit({ size: '20FT', manualStatus: 'MAINTENANCE' })], [], TODAY);
  const r = checkChassisAvailability('20 GP', none);
  assert.equal(r.blocked, false, 'a gate here would be overridden constantly');
  assert.match(r.warning ?? '', /warning/);
});

test('§35.5: occupancy is job duration, not trip count', () => {
  const h = hold({ mountedAt: '2026-08-25T00:00:00Z', releasedAt: '2026-09-01T00:00:00Z' });
  assert.equal(chassisDays(h, '2026-09-05T00:00:00Z'), 7);
});

test('§35.5: an open holding counts to now', () => {
  assert.equal(chassisDays(hold({ mountedAt: '2026-08-25T00:00:00Z' }), '2026-09-01T00:00:00Z'), 7);
});

test('§35.2: a double-mounted pair counts once, not twice', () => {
  const pair = [
    hold({ containerId: 'c1', doubleMountedWith: 'c2' }),
    hold({ containerId: 'c2', doubleMountedWith: 'c1' }),
  ];
  assert.equal(jobChassisDays(pair, '2026-09-01T00:00:00Z'), 7,
    'counting per container would inflate occupancy and hide the benefit');
});

test('§35.2: two separate units on one job both count', () => {
  const two = [
    hold({ chassisId: 'a', containerId: 'c1' }),
    hold({ chassisId: 'b', containerId: 'c2' }),
  ];
  assert.equal(jobChassisDays(two, '2026-09-01T00:00:00Z'), 14);
});

test('§35.6: capacity falls out of average job duration', () => {
  // The PRD's own worked figures: 47 twenty-foot units at six days.
  assert.equal(monthlyCapacity(47, 6), 235);
  assert.equal(monthlyCapacity(42, 6), 210);
  // Shortening the average job by one day is worth ~20 per cent.
  assert.equal(monthlyCapacity(47, 5), 282);
});

test('§35.7: a unit held too long on one customer is flagged', () => {
  const found = detectChassisExceptions({
    unit: unit(), holdings: [hold({ mountedAt: '2026-08-01T00:00:00Z' })],
    availability: fleetAvailability([unit()], [hold()], TODAY),
    today: TODAY, customerLimitDays: 10, fleetFloor: 0, inspectionWarningDays: 14,
  });
  assert.ok(found.some((e) => e.exceptionType === 'Chassis held beyond threshold'));
});

test('§35.7: a low fleet raises a high-severity exception', () => {
  const fleet = [unit({ size: '40FT' })];
  const availability = fleetAvailability(fleet, [hold()], TODAY);
  const found = detectChassisExceptions({
    unit: unit(), holdings: [hold()], availability, today: TODAY,
    customerLimitDays: 30, fleetFloor: 3, inspectionWarningDays: 14,
  });
  const low = found.find((e) => e.exceptionType === 'Fleet availability low');
  assert.equal(low?.severity, 'HIGH');
});

test('§35.7: inspection due inside the warning window is flagged', () => {
  const found = detectChassisExceptions({
    unit: unit({ inspectionDueDate: '2026-09-10' }), holdings: [],
    availability: fleetAvailability([unit()], [], TODAY),
    today: TODAY, customerLimitDays: 30, fleetFloor: 0, inspectionWarningDays: 14,
  });
  assert.ok(found.some((e) => e.exceptionType === 'Chassis inspection due'));
});


test('§35.8: maintenance while a container is mounted raises an exception', () => {
  const found = detectChassisExceptions({
    unit: unit({ manualStatus: 'MAINTENANCE' }), holdings: [hold()],
    availability: fleetAvailability([unit()], [hold()], TODAY),
    today: TODAY, customerLimitDays: 30, fleetFloor: 0, inspectionWarningDays: 0,
  });
  const exc = found.find((e) => e.exceptionType === 'Chassis maintenance mid-job');
  assert.equal(exc?.severity, 'HIGH', 'the only case that forces a dismount');
});

test('§35.8: a chassis change requires a named user, a reason and a location', () => {
  const base = {
    containerId: 'c1', jobId: 'j1', chassisIdPrevious: 'CH-4029',
    chassisIdNew: 'CH-4030', reason: 'Brake fault', location: 'Pioneer yard',
    changedAt: '2026-08-28T00:00:00Z', changedBy: 'Brandon',
  };
  assert.equal(validateChassisChange(base).valid, true);
  assert.equal(validateChassisChange({ ...base, reason: '' }).valid, false);
  assert.equal(validateChassisChange({ ...base, changedBy: ' ' }).valid, false);
  assert.equal(validateChassisChange({ ...base, location: '' }).valid, false);
});

test('§35.8: grounding is a legitimate outcome, not an error', () => {
  const change = recordChassisChange({
    containerId: 'c1', jobId: 'j1', chassisIdPrevious: 'CH-4029', chassisIdNew: null,
    reason: 'No replacement available at the yard', location: 'Pioneer yard',
    changedAt: '2026-08-28T00:00:00Z', changedBy: 'Brandon',
  }, 'chg-1');
  assert.equal(change.containerGrounded, true);
  assert.equal(change.chassisIdNew, null,
    'the system records the outcome; it does not assume a replacement exists');
});

test('§35.8: occupancy splits across both units, falsifying neither', () => {
  const before = [hold({ chassisId: 'CH-4029', containerId: 'c1', mountedAt: '2026-08-25T00:00:00Z' })];
  const change = recordChassisChange({
    containerId: 'c1', jobId: 'j1', chassisIdPrevious: 'CH-4029', chassisIdNew: 'CH-4030',
    reason: 'Brake fault', location: 'Pioneer yard',
    changedAt: '2026-08-28T00:00:00Z', changedBy: 'Brandon',
  }, 'chg-1');

  const after = applyChassisChange(before, change);
  assert.equal(after.length, 2, 'two holdings, not one edited in place');

  const withdrawn = after.find((h) => h.chassisId === 'CH-4029')!;
  const replacement = after.find((h) => h.chassisId === 'CH-4030')!;
  assert.equal(chassisDays(withdrawn, '2026-09-01T00:00:00Z'), 3, 'the withdrawn unit stops at the change');
  assert.equal(chassisDays(replacement, '2026-09-01T00:00:00Z'), 4, 'the replacement starts there');
});

test('§35.8: a grounded container leaves no replacement holding', () => {
  const before = [hold({ chassisId: 'CH-4029', containerId: 'c1' })];
  const change = recordChassisChange({
    containerId: 'c1', jobId: 'j1', chassisIdPrevious: 'CH-4029', chassisIdNew: null,
    reason: 'Grounded pending repair', location: 'Yard',
    changedAt: '2026-08-28T00:00:00Z', changedBy: 'Brandon',
  }, 'chg-2');
  const after = applyChassisChange(before, change);
  assert.equal(after.length, 1);
  assert.equal(after[0]?.releasedAt, '2026-08-28T00:00:00Z');
});

test('§35.8: changing a unit that is not mounted fails loudly', () => {
  const change = recordChassisChange({
    containerId: 'c1', jobId: 'j1', chassisIdPrevious: 'CH-9999', chassisIdNew: 'CH-4030',
    reason: 'x', location: 'y', changedAt: '2026-08-28T00:00:00Z', changedBy: 'B',
  }, 'chg-3');
  assert.throws(() => applyChassisChange([hold({ chassisId: 'CH-4029' })], change), /No open holding/);
});
