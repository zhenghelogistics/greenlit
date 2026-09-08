import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMemoryRepository } from '../src/memory.ts';
import { JobService } from '../src/service.ts';

/**
 * Golden test over derived output.
 *
 * Unit tests prove individual rules. This proves the *whole derivation* for
 * every fixture, so a rule change that alters real-world behaviour surfaces as
 * an explicit diff to approve rather than passing green because no single unit
 * test happened to cover that combination.
 *
 * Regenerate deliberately, and read the diff:
 *   UPDATE_GOLDEN=1 node --test tests/golden.test.ts
 */
const GOLDEN = fileURLToPath(new URL('./golden.json', import.meta.url));
const FROZEN_NOW = '2026-09-01T00:00:00Z';

test('derived output for every fixture matches the approved snapshot', async () => {
  const service = new JobService(createMemoryRepository(), () => FROZEN_NOW);
  const jobs = await service.listJobs();

  // Only the derived surface. Stored fields would make this a change detector
  // for fixtures rather than for behaviour.
  const actual = jobs.map((j) => ({
    jobNumber: j.jobNumber,
    domain: j.domain,
    jobStatus: j.jobStatus,
    location: j.location,
    nextActionRequired: j.nextActionRequired,
    blockingReason: j.blockingReason,
    waitingOn: j.waitingOn,
    mandatoryComplete: j.mandatoryComplete,
    missingInformation: j.missingInformation,
    containers: j.containers.map((c) => ({
      reference: c.reference,
      status: c.status,
      location: c.location,
      gatePassed: c.gatePassed,
      gateFailures: c.gateFailures,
    })),
  }));

  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + '\n');
    console.log(`golden snapshot written: ${actual.length} jobs`);
    return;
  }

  const expected = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  assert.deepEqual(actual, expected,
    'Derived behaviour changed. Read the diff: if intended, rerun with UPDATE_GOLDEN=1.');
});
