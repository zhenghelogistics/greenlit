import { runRepositoryContract } from '../../core/tests/contract.ts';
import { createSupabaseRepository } from '../src/supabase.ts';
import { readFileSync } from 'node:fs';

/**
 * The contract suite, run against the real project.
 *
 * This is the proof ADR-0001 promised: the same tests the in-memory adapter
 * passes, run unchanged against Postgres. Skipped when no credentials are
 * present, so CI and anyone without access still get a green run.
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

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
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
