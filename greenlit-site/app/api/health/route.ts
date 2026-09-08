import { getRepository, storageKind } from "../../../lib/greenlit";

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
    const customers = await getRepository().listCustomers();
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
