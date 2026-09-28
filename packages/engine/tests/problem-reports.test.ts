import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reportReadiness, PRIORITY_WORDS, REPORT_PRIORITIES,
  WRITE_UP_INSTRUCTION } from '../src/problem-reports.ts';

test('a report is judged on its context, never on its writing', () => {
  // "this is broken" from a named screen with the engine's state attached is
  // worth more than a paragraph with none of that. Requiring people to write
  // well is how a fault goes unreported instead.
  const terse = reportReadiness('this is broken', {
    screen: 'jobs', release: 'abc123',
  });
  assert.equal(terse.actionable, true);
});

test('a report with no words is not a report', () => {
  const empty = reportReadiness('   ', { screen: 'jobs', release: 'abc123' });
  assert.equal(empty.actionable, false);
  assert.match(empty.missing.join(' '), /own words/);
});

test('the screen and the release are what make it reproducible', () => {
  // The release especially: a fault already fixed and not yet deployed reads
  // exactly like a live one, and chasing it is wasted.
  const r = reportReadiness('it did the wrong thing', {});
  assert.equal(r.actionable, false);
  assert.match(r.missing.join(' '), /which screen/);
  assert.match(r.missing.join(' '), /version was deployed/);
});

test('a report about a job carries what the engine derived for it', () => {
  // The screen disagreeing with the engine is the shape of nearly every fault
  // found so far, and it can only be seen by putting the two side by side.
  const withoutDerived = reportReadiness('this job looks wrong', {
    screen: 'job', release: 'abc123', jobId: 'dksh-001',
  });
  assert.equal(withoutDerived.actionable, false);
  assert.match(withoutDerived.missing.join(' '), /engine had derived/);

  const withDerived = reportReadiness('this job looks wrong', {
    screen: 'job', release: 'abc123', jobId: 'dksh-001',
    derived: { waitingOn: 'US', blockingReason: 'Permit not applied for' },
  });
  assert.equal(withDerived.actionable, true);
});

test('a report about a screen rather than a job is still actionable', () => {
  // Plenty are about a list or a layout. Demanding a job number would make
  // those unreportable.
  const r = reportReadiness('the columns are cut off on this list', {
    screen: 'jobs', release: 'abc123',
  });
  assert.equal(r.actionable, true);
});

test('a screenshot is not required', () => {
  // It helps and it is not always possible: a browser may refuse, and somebody
  // reporting from a phone may have moved on before opening the form.
  const r = reportReadiness('wrong yard shown', { screen: 'job', release: 'abc123' });
  assert.equal(r.actionable, true);
  assert.equal(r.missing.length, 0);
});

test('every priority has words somebody would recognise', () => {
  for (const p of REPORT_PRIORITIES) {
    assert.ok(PRIORITY_WORDS[p], `${p} has no wording`);
    assert.doesNotMatch(PRIORITY_WORDS[p], /[A-Z]{2,}/, 'no identifiers on screen');
  }
});

test('the write-up is told not to invent and not to reword', () => {
  // Both are how a report becomes worse than useless: one sends somebody to
  // fix the wrong thing, the other loses the detail that identified it.
  assert.match(WRITE_UP_INSTRUCTION, /Do not invent/);
  assert.match(WRITE_UP_INSTRUCTION, /Do not soften or reword/);
  assert.match(WRITE_UP_INSTRUCTION, /openQuestions/);
});

test('the instruction asks for every field the shape holds', () => {
  // Changing what is asked for without changing the shape gives a write-up
  // nothing reads, and the two live in one file so that stays visible.
  const source = readFileSync(new URL('../src/problem-reports.ts', import.meta.url), 'utf8');
  const fields = [...source.matchAll(/^\s{2}(\w+)[?]?:/gm)].map((m) => m[1]);
  for (const field of ['summary', 'painPoint', 'goal', 'steps', 'priority', 'openQuestions']) {
    assert.ok(fields.includes(field), `${field} is not on StructuredReport`);
    assert.match(WRITE_UP_INSTRUCTION, new RegExp(`\\b${field}\\b`), `${field} is not asked for`);
  }
});
