import { getRepository, storageKind } from "../../../lib/greenlit";

/**
 * Columns added by a migration after the first release.
 *
 * Code deployed ahead of its migration does not fail at start-up: it serves
 * every page, passes this check as it was, and then fails on the first write
 * that touches the missing column — "Could not find the 'package_count'
 * column", from a controller trying to create a job. The deployment looks
 * healthy right up until someone tries to use it.
 *
 * Listing the columns here rather than reading the migration files keeps the
 * check honest about what the running code actually needs.
 */
const REQUIRED_COLUMNS: Record<string, string[]> = {
  import_jobs: ["house_bl_number"],
  containers: ["free_time_remarks", "package_count", "package_type"],
};

/** Which of those a live database is missing. Empty for in-memory. */
async function missingColumns(): Promise<string[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  const missing: string[] = [];
  await Promise.all(Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) =>
    columns.map(async (column) => {
      const response = await fetch(`${url}/rest/v1/${table}?select=${column}&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (!response.ok) missing.push(`${table}.${column}`);
    })));
  return missing;
}

/**
 * What this instance is actually running against.
 *
 * Worth having because the in-memory fallback is silent by design: without
 * this, a deployment missing its environment variables looks like it works
 * until data quietly fails to persist.
 */
export async function GET() {
  const storage = storageKind();
  try {
    const [customers, missing] = await Promise.all([
      getRepository().listCustomers(),
      missingColumns(),
    ]);

    if (missing.length) {
      return Response.json({
        ok: false,
        storage,
        customers: customers.length,
        missingColumns: missing,
        note: `The database is behind this build. Run the pending migration: ${missing.join(", ")} `
          + "are missing, and job creation will fail until they exist.",
      }, { status: 503 });
    }

    return Response.json({
      ok: true,
      storage,
      customers: customers.length,
      note: storage === "memory"
        ? "In-memory: nothing persists between requests."
        : "Supabase: data persists.",
    });
  } catch (error) {
    return Response.json({
      ok: false,
      storage,
      error: error instanceof Error ? error.message : "Unknown error",
      note: storage === "supabase"
        ? "Supabase is configured but unreachable. Has the migration been run?"
        : undefined,
    }, { status: 503 });
  }
}
