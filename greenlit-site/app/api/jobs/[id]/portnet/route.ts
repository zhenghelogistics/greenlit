import { authorize, readJson, runCommand } from "../../../../../lib/command";

/**
 * §27.5. No Portnet API in the MVP, so a person confirms and is recorded
 * doing so.
 *
 * `containerIds` names the boxes the release covers. Omitted means all of
 * them, which is the ordinary case and what this always used to mean.
 *
 * A release email frequently names some containers and not others. Recording
 * that as a whole-job release tells a controller a box can be collected when
 * Portnet has not released it, and the trip is refused at the terminal with
 * the driver already there.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorize("portnet.confirm");
  if (!auth.ok) return auth.response;

  const body = await readJson<Record<string, unknown>>(request).catch(() => null);
  const containerIds = Array.isArray(body?.containerIds)
    ? body.containerIds.map(String).filter(Boolean)
    : undefined;

  const scope = body?.scope === "all" || body?.scope === "selected" ? body.scope : null;
  return runCommand(id, async (repo) => {
    await repo.recordPortnetReleased(id, auth.displayName, containerIds);
    // What the bulk action covered, in the demo's words.
    if (scope) {
      await repo.sayOnJob(id, `Controller applied Portnet Release to ${scope === "all"
        ? "all pending containers in this job" : "selected containers in this job"}`
        + `${containerIds ? ` (${containerIds.length})` : ""}.`, auth.displayName);
    }
  });
}
