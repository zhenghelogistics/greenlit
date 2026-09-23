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
