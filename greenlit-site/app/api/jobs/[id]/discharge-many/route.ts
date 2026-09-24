import { authorize, runCommand } from "../../../../../lib/command";

/**
 * Discharge several containers on one job at once.
 *
 * Scoped to the job deliberately. An "apply to all pending" that reached
 * across jobs was built and then removed: a controller confirming one vessel's
 * discharge would silently mark another vessel's containers too.
 *
 * Two clicks per container to record one fact about one bill of lading is the
 * largest piece of repetition in the whole workflow. A thirty-container job is
 * sixty clicks.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorize("readiness.record");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.containerIds) ? body.containerIds : [];
  if (ids.length === 0) {
    return Response.json({ error: "Name the containers to discharge." }, { status: 400 });
  }

  return runCommand(id, async (repo) => {
    // Sequentially: each records its own audit line, and a partial failure
    // should leave the ones already done recorded rather than rolled back.
    for (const containerId of ids) {
      await repo.recordDischarged(containerId, auth.displayName);
    }
  });
}
