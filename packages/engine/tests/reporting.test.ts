import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { periodFor, previousPeriod, volumeIn, stillOpenAt,
  type ReportableJob } from '../src/reporting.ts';

const job = (over: Partial<ReportableJob> & { jobNumber: string }): ReportableJob => ({
  domain: 'IMPORT', customer: 'DKSH', openedOn: '2026-09-02', closedOn: null,
  containerCount: 1, waitingOn: 'US', blockingReason: null, ...over,
});

test('a month runs to its last day, not to the first of the next', () => {
  // Off by one here puts a day of work in the wrong month, and the figure in
  // the deck stops matching the figure on the screen.
  assert.deepEqual(periodFor('MONTH', '2026-09-14'),
    { kind: 'MONTH', from: '2026-09-01', to: '2026-09-30', label: 'September 2026' });
  assert.equal(periodFor('MONTH', '2026-02-10').to, '2026-02-28');
  assert.equal(periodFor('MONTH', '2028-02-10').to, '2028-02-29', 'leap year');
  assert.equal(periodFor('MONTH', '2100-02-10').to, '2100-02-28', 'not a leap year');
});

test('a quarter is found from any day inside it', () => {
  // Nobody should be working out which quarter a date falls in.
  assert.equal(periodFor('QUARTER', '2026-09-26').label, 'Q3 2026');
  assert.equal(periodFor('QUARTER', '2026-09-26').from, '2026-07-01');
  assert.equal(periodFor('QUARTER', '2026-09-26').to, '2026-09-30');
  assert.equal(periodFor('QUARTER', '2026-01-01').label, 'Q1 2026');
  assert.equal(periodFor('QUARTER', '2026-12-31').to, '2026-12-31');
});

test('the comparison column crosses the new year correctly', () => {
  // January compares against December, and Q1 against the previous Q4.
  assert.equal(previousPeriod(periodFor('MONTH', '2026-01-15')).label, 'December 2025');
  assert.equal(previousPeriod(periodFor('QUARTER', '2026-02-15')).label, 'Q4 2025');
  assert.equal(previousPeriod(periodFor('YEAR', '2026-06-01')).label, '2025');
  assert.equal(previousPeriod(periodFor('MONTH', '2026-09-15')).label, 'August 2026');
});

test('work is counted in the month it was taken on', () => {
  const jobs = [
    job({ jobNumber: 'A', openedOn: '2026-09-02', containerCount: 3 }),
    job({ jobNumber: 'B', openedOn: '2026-09-30', containerCount: 1, domain: 'EXPORT' }),
    job({ jobNumber: 'C', openedOn: '2026-10-01', containerCount: 9 }),
    job({ jobNumber: 'D', openedOn: '2026-08-31', containerCount: 9 }),
  ];
  const september = volumeIn(jobs, periodFor('MONTH', '2026-09-01'));
  assert.equal(september.jobsOpened, 2);
  assert.equal(september.containers, 4);
  assert.equal(september.imports, 1);
  assert.equal(september.exports, 1);
});

test('a job opened in one month and closed in the next counts in both', () => {
  // August's intake and September's completion. Picking one would understate
  // whichever month the meeting happens to be about.
  const jobs = [job({ jobNumber: 'A', openedOn: '2026-08-20', closedOn: '2026-09-03' })];
  assert.equal(volumeIn(jobs, periodFor('MONTH', '2026-08-01')).jobsOpened, 1);
  assert.equal(volumeIn(jobs, periodFor('MONTH', '2026-08-01')).jobsClosed, 0);
  assert.equal(volumeIn(jobs, periodFor('MONTH', '2026-09-01')).jobsOpened, 0);
  assert.equal(volumeIn(jobs, periodFor('MONTH', '2026-09-01')).jobsClosed, 1);
});

test('customers are listed busiest first', () => {
  const jobs = [
    job({ jobNumber: 'A', customer: 'JAS' }),
    job({ jobNumber: 'B', customer: 'DKSH', containerCount: 2 }),
    job({ jobNumber: 'C', customer: 'DKSH' }),
  ];
  const v = volumeIn(jobs, periodFor('MONTH', '2026-09-01'));
  assert.deepEqual(v.byCustomer, [
    { customer: 'DKSH', jobs: 2, containers: 3 },
    { customer: 'JAS', jobs: 1, containers: 1 },
  ]);
});

test('still open means open on that day, not open now', () => {
  // Running September's report in October must give September's answer.
  const jobs = [
    job({ jobNumber: 'A', openedOn: '2026-09-01', closedOn: '2026-09-20' }),
    job({ jobNumber: 'B', openedOn: '2026-09-01', closedOn: '2026-10-05' }),
    job({ jobNumber: 'C', openedOn: '2026-10-02' }),
  ];
  const atEndOfSeptember = stillOpenAt(jobs, '2026-09-30');
  assert.equal(atEndOfSeptember.total, 1, 'B only: A had closed, C had not started');
});

test('a job closed on the last day of the period is closed', () => {
  // The boundary decides whether a job appears as outstanding in the meeting.
  const jobs = [job({ jobNumber: 'A', openedOn: '2026-09-01', closedOn: '2026-09-30' })];
  assert.equal(stillOpenAt(jobs, '2026-09-30').total, 0);
  assert.equal(stillOpenAt(jobs, '2026-09-29').total, 1);
});

test('open work is grouped by who has the ball, us first', () => {
  // Seven jobs waiting on us is a staffing conversation; seven waiting on the
  // carrier is not. That split is the point of the slide.
  const jobs = [
    job({ jobNumber: 'A', waitingOn: 'CARRIER', blockingReason: 'Last free day not published' }),
    job({ jobNumber: 'B', waitingOn: 'CARRIER', blockingReason: 'Last free day not published' }),
    job({ jobNumber: 'C', waitingOn: 'US', blockingReason: 'Permit not applied for' }),
    job({ jobNumber: 'D', waitingOn: 'CUSTOMER', blockingReason: 'CMS not done' }),
  ];
  const open = stillOpenAt(jobs, '2026-09-30');
  assert.equal(open.total, 4);
  assert.deepEqual(open.groups.map((g) => g.waitingOn), ['US', 'CUSTOMER', 'CARRIER']);
  assert.deepEqual(open.groups[2]!.reasons,
    [{ reason: 'Last free day not published', jobs: 2 }]);
});

test('a job nobody can explain is shown, not dropped', () => {
  // Work with no recorded reason is the most interesting line on the page, and
  // omitting it would make the total disagree with the groups beneath it.
  const jobs = [
    job({ jobNumber: 'A', waitingOn: 'US', blockingReason: null }),
    job({ jobNumber: 'B', waitingOn: 'US', blockingReason: '   ' }),
  ];
  const open = stillOpenAt(jobs, '2026-09-30');
  assert.equal(open.total, 2);
  assert.deepEqual(open.groups[0]!.reasons, [{ reason: 'No reason recorded', jobs: 2 }]);
  assert.equal(open.groups.reduce((sum, g) => sum + g.jobs, 0), open.total,
    'the groups always add up to the total');
});

test('the report never works out for itself why a job is stuck', () => {
  // There must be one answer to "what is this job waiting for". Two would
  // disagree in front of the people least able to tell which was right.
  const code = readFileSync(new URL('../src/reporting.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /\bevaluate\b|\bRULES\b|\bprecedence\b/);
});
