import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('../migrations/', import.meta.url).pathname;
const sql = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

/**
 * Tables the schema creates, read from the migrations themselves rather than
 * listed here, so this cannot drift from what actually exists.
 */
const created = (): Set<string> => {
  const tables = new Set<string>();
  for (const file of sql) {
    const text = readFileSync(join(DIR, file), 'utf8');
    for (const m of text.matchAll(/create table\s+(?:if not exists\s+)?([a-z_]+)/gi)) {
      tables.add(m[1]!.toLowerCase());
    }
  }
  return tables;
};

test('a migration only alters a table the schema actually has', () => {
  // 0016 shipped altering `import_containers`, which does not exist: import
  // containers live in `containers` and only the export side is prefixed. The
  // migration was run against the live database and failed there, which is the
  // worst place to find out, and the cheapest place to have found out is here.
  const tables = created();
  const problems: string[] = [];

  for (const file of sql) {
    const text = readFileSync(join(DIR, file), 'utf8')
      // Line comments explain; they do not touch tables.
      .replace(/^\s*--.*$/gm, '');

    const touched = [
      ...text.matchAll(/alter table\s+(?:if exists\s+)?([a-z_]+)/gi),
      ...text.matchAll(/\bon\s+([a-z_]+)\s*\(/gi),
      ...text.matchAll(/\binsert into\s+([a-z_]+)/gi),
    ];

    for (const m of touched) {
      const table = m[1]!.toLowerCase();
      // `on` also introduces a trigger's timing clause and a join condition;
      // only flag a name that looks like a table we have never created.
      if (!tables.has(table) && /_|s$/.test(table) && table.length > 3) {
        problems.push(`${file}: ${table}`);
      }
    }
  }

  assert.deepEqual(problems, [],
    `migrations reference tables the schema never creates. Known tables: ${[...tables].sort().join(', ')}`);
});

test('no script deletes from a table the schema protects', () => {
  // A testing script tried to clear the audit trail and the database refused:
  //
  //   ERROR: audit_events is append-only (PRD §13): DELETE is not permitted
  //
  // The trigger is right and the script was wrong, and the only reason anybody
  // found out is that somebody ran it against a real database and read the
  // error. A script that argues with the schema should fail here instead.
  const schema = sql.map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n');

  const guarded = new Set<string>();
  for (const match of schema.matchAll(
    /create trigger\s+\w+\s+before[^;]*?delete[^;]*?on\s+(\w+)/gis,
  )) {
    // A capture group that matched always has a value; TypeScript cannot know
    // that, and an empty name would be harmless here anyway.
    if (match[1]) guarded.add(match[1]);
  }
  assert.ok(guarded.has('audit_events'), 'sanity: the append-only guard was found');

  const scriptsDir = join(DIR, '..', '..', '..', 'scripts');
  const scripts = readdirSync(scriptsDir).filter((f) => f.endsWith('.sql'));
  assert.ok(scripts.length > 0, 'sanity: there are scripts to check');

  const offences: string[] = [];
  for (const file of scripts) {
    // Statements only: the comment explaining why this is refused names the
    // table, and a comment is not a delete.
    const statements = readFileSync(join(scriptsDir, file), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    for (const match of statements.matchAll(/delete\s+from\s+(\w+)/gi)) {
      const table = match[1];
      if (table && guarded.has(table)) offences.push(`${file}: delete from ${table}`);
    }
  }

  assert.deepEqual(offences, [],
    'these scripts delete from a table whose trigger refuses deletes, so they '
    + 'abort the whole transaction when run');
});

test('every code in the customer seed is one the database will accept', () => {
  // A code is issued once and never changes, because every job number for that
  // customer is built from it. A seed that proposes an invalid one fails at the
  // moment somebody pastes it into a live database, which is the worst moment
  // to find out — half the list is in and the transaction has rolled back.
  //
  // The rule is the table's own: two to six letters, no digits, unique.
  const seed = readFileSync(join(DIR, '..', '..', '..', 'scripts', 'seed-customers.sql'), 'utf8');
  const rows = [...seed.matchAll(/\('([^']*)',\s*'([^']*)',/g)];
  assert.ok(rows.length > 20, `expected the customer list, found ${rows.length}`);

  const codes = rows.map((r) => r[2]!);
  const invalid = codes.filter((c) => !/^[A-Z]{2,6}$/.test(c));
  assert.deepEqual(invalid, [], 'these codes fail the check the customers table enforces');

  const seen = new Set<string>();
  const duplicated = codes.filter((c) => !seen.add(c));
  assert.deepEqual(duplicated, [], 'a code is unique, and a job number depends on which customer it means');

  const ids = rows.map((r) => r[1]!);
  const seenIds = new Set<string>();
  assert.deepEqual(ids.filter((i) => !seenIds.add(i)), [], 'customer_id is the primary key');
});
