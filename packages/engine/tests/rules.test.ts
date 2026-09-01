import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_RULES } from '../src/rules-import.ts';
import { EXPORT_RULES } from '../src/rules-export.ts';
import { evaluate, evaluateRuleId, PRECEDENCE } from '../src/next-action.ts';
import { importBase, exportBase } from './fixtures.ts';
import type { ImportCtx } from '../src/rules-import.ts';
import type { ExportCtx } from '../src/rules-export.ts';

/**
 * §59.6: "The engine is exercised by tests covering every row of Sections 37
 * and 47." Each entry names a rule and the minimal state that should fire it.
 */
const IMPORT_CASES: Record<string, Partial<ImportCtx>> = {
  IMP_LFD_CRITICAL: { collected: false, daysUntilLfd: 0 },
  IMP_DETENTION_APPROACHING: { emptyReturned: false, detentionLfdApproaching: true },
  IMP_MOVEMENT_OVERDUE: { deliveryOverdue: true },
  IMP_MANDATORY_MISSING: { mandatoryComplete: false, missingFields: ['Delivery Address'] },
  IMP_PERMIT_REJECTED: { permitRejected: true },
  IMP_PORTNET_UNCONFIRMED: { portnetRequired: true, portnetReleased: false },
  IMP_DOCUMENT_CONFLICT: { documentConflictOpen: true },
  IMP_ASSIGN_TRANSPORT: { collectionEligible: true, hasScheduledDelivery: false, collected: false },
  IMP_CAPTURE_POD: { podCaptured: false },
  IMP_PERMIT_MISSING: { permitRequired: true, permitReceived: false },
  IMP_ADDRESS_DISPUTED: { deliveryAddressMissing: true },
  IMP_EXCEPTION_OPEN: { openExceptionWaitingOn: 'US' },
  IMP_DELIVER: { delivered: false, podCaptured: false },
  IMP_RETURN_EMPTY: { emptyReturned: false },
  IMP_CLOSE_JOB: { allMovementsComplete: true },
};

const EXPORT_CASES: Record<string, Partial<ExportCtx>> = {
  EXP_VESSEL_CLOSING: { vesselClosingAtRisk: true },
  EXP_MOVEMENT_OVERDUE: { movementOverdue: true },
  EXP_EMPTY_OVERDUE: { emptyOverdue: true },
  EXP_MANDATORY_MISSING: { mandatoryComplete: false, missingFields: ['Booking Reference'] },
  EXP_CMS_PENDING: { cmsRequired: true, cmsCompleted: false },
  EXP_CAPTURE_DETAILS: { containerNumberCaptured: false, detailsSent: false },
  EXP_SEND_DETAILS: { detailsSent: false },
  EXP_ARRANGE_EMPTY: { emptyGatePassed: true, emptyScheduled: false, emptyCollected: false },
  EXP_CHECK_TRANSHIPMENT: { transhipmentStatus: 'PENDING' },
  EXP_ARRANGE_LADEN: { ladenGatePassed: true, hasLadenMovement: false },
  EXP_ARRANGE_ONE_WAY: {
    ladenGatePassed: true, transhipmentStatus: 'NOT_AVAILABLE',
    carparkRequested: true, hasLadenMovement: false,
  },
  EXP_ARRANGE_CARPARK_TO_PORT: { atCarpark: true },
  EXP_CARPARK_DWELL: { atCarpark: true, transhipmentStatus: 'NOT_AVAILABLE', carparkDwellDays: 9 },
  EXP_CLOSE_JOB: { deliveredToPort: true },
  EXP_VGM_IMPLAUSIBLE: { vgmImplausible: true },
  EXP_OBTAIN_VGM: { vgmReceived: false },
  EXP_STUFFING_OVERDUE: { containerReady: false, stuffingOverdue: true },
  EXP_CHECK_CARPARK_REQUIREMENT: { transhipmentStatus: 'NOT_AVAILABLE' },
  EXP_AWAIT_TRANSHIPMENT: { atCarpark: true, transhipmentStatus: 'NOT_AVAILABLE' },
  EXP_AWAIT_STUFFING: { containerReady: false },
};

test('§37: every import rule row is reachable', () => {
  for (const rule of IMPORT_RULES) {
    const override = IMPORT_CASES[rule.id];
    assert.ok(override, `no test case defined for import rule ${rule.id}`);
    assert.ok(rule.when({ ...importBase, ...override }), `${rule.id} did not fire`);
  }
});

test('§47: every export rule row is reachable', () => {
  for (const rule of EXPORT_RULES) {
    const override = EXPORT_CASES[rule.id];
    assert.ok(override, `no test case defined for export rule ${rule.id}`);
    assert.ok(rule.when({ ...exportBase, ...override }), `${rule.id} did not fire`);
  }
});

test('no orphan test cases', () => {
  const importIds = new Set(IMPORT_RULES.map((r) => r.id));
  const exportIds = new Set(EXPORT_RULES.map((r) => r.id));
  for (const id of Object.keys(IMPORT_CASES)) assert.ok(importIds.has(id), `stale import case ${id}`);
  for (const id of Object.keys(EXPORT_CASES)) assert.ok(exportIds.has(id), `stale export case ${id}`);
});

test('rule ids are unique', () => {
  const all = [...IMPORT_RULES, ...EXPORT_RULES].map((r) => r.id);
  assert.equal(new Set(all).size, all.length);
});

test('§25.1: internal blockers outrank external ones', () => {
  // Waiting on the customer for VGM AND on us to arrange the laden movement.
  // The PRD is explicit: show our task, it is the one we can act on now.
  const ctx: ExportCtx = {
    ...exportBase, containerReady: true, vgmReceived: false,
    ladenGatePassed: true, hasLadenMovement: false,
  };
  const result = evaluate(EXPORT_RULES, ctx);
  assert.equal(result.waitingOn, 'US');
  assert.equal(evaluateRuleId(EXPORT_RULES, ctx), 'EXP_ARRANGE_LADEN');
});

test('§25.1: deadline risk outranks an internal blocker', () => {
  const ctx: ImportCtx = {
    ...importBase, collected: false, daysUntilLfd: 0,
    collectionEligible: true, hasScheduledDelivery: false,
  };
  assert.equal(evaluateRuleId(IMPORT_RULES, ctx), 'IMP_LFD_CRITICAL');
});

test('§25: exactly one action, and a reason accompanies it', () => {
  const ctx: ImportCtx = { ...importBase, mandatoryComplete: false, missingFields: ['ETA'] };
  const r = evaluate(IMPORT_RULES, ctx);
  assert.equal(r.nextActionRequired, 'Complete job information');
  assert.match(r.blockingReason ?? '', /ETA/);
});

test('nothing outstanding yields No action required, waiting on nobody', () => {
  const quiet: ImportCtx = { ...importBase, jobOpen: false };
  const r = evaluate(IMPORT_RULES, quiet);
  assert.equal(r.nextActionRequired, 'No action required');
  assert.equal(r.waitingOn, 'NOBODY');
  assert.equal(r.blockingReason, null);
});

test('precedence ladder is ordered as §25.1 states', () => {
  assert.ok(PRECEDENCE.DEADLINE_RISK < PRECEDENCE.OVERDUE_MOVEMENT);
  assert.ok(PRECEDENCE.OVERDUE_MOVEMENT < PRECEDENCE.INTERNAL_BLOCKER);
  assert.ok(PRECEDENCE.INTERNAL_BLOCKER < PRECEDENCE.EXTERNAL_BLOCKER);
  assert.ok(PRECEDENCE.EXTERNAL_BLOCKER < PRECEDENCE.ROUTINE);
});
