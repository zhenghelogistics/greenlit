import { runRepositoryContract } from '../../core/tests/contract.ts';
import { createSupabaseRepository } from '../src/supabase.ts';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * The contract suite, run against a real Postgres project.
 *
 * This is the proof ADR-0001 promised: the same tests the in-memory adapter
 * passes, run unchanged against Postgres.
 *
 * It is opt-in, and deliberately not part of `npm run verify`. The suite
 * writes — jobs, audit events, discrepancies — and the credentials in
 * .env.local point at the live project, so running it by default meant every
 * verify quietly added rows to production. It also made verify fail for an
 * honest reason that had nothing to do with the code: purging the fixture
 * customers left the setup with no customer to attach a job to.
 *
 * Run it deliberately, against a database you are willing to write to:
 *
 *   GREENLIT_CONTRACT_DB=1 npm run test --workspace @greenlit/db
 */
function env(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(new URL('../../../greenlit-site/.env.local', import.meta.url), 'utf8')
        .trim().split('\n').filter(Boolean)
        .map((line) => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }),
    );
  } catch { return {}; }
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = { ...env(), ...process.env } as Record<string, string>;

if (!process.env.GREENLIT_CONTRACT_DB) {
  test("[supabase] contract suite is opt-in", { skip: "set GREENLIT_CONTRACT_DB=1 to run" }, () => {});
} else if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  test("[supabase] contract suite needs credentials", { skip: "no SUPABASE_URL" }, () => {});
} else {
  const repo = createSupabaseRepository({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

  // The contract seeds nothing: it needs ids that already exist. These are
  // created once, here, rather than by each test.
  const seeded = await (async () => {
    const imports = await repo.listImportJobs();
    const exports_ = await repo.listExportJobs();
    const importJob = imports[0] ?? await repo.createImportJob({ customerCode: 'ABC' }, 'contract-setup');
    const exportJob = exports_[0] ?? await repo.createExportJob({ customerCode: 'STR', containerQuantity: 2 }, 'contract-setup');
    const containers = await repo.listContainersForExportJob(
      'exportJobId' in exportJob ? exportJob.exportJobId : '',
    );
    return {
      importJobId: 'jobId' in importJob ? importJob.jobId : '',
      exportJobId: 'exportJobId' in exportJob ? exportJob.exportJobId : '',
      exportContainerId: containers[0]?.exportContainerId ?? '',
    };
  })();

  runRepositoryContract('supabase', () => repo, seeded);
}
