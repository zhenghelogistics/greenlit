import { authorize, badRequest, readJson, runCommand } from "../../../../../../../lib/command";

/** §43. The customer confirms the container is ready after stuffing. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; containerId: string }> }) {
  const { id, containerId } = await ctx.params;
  const body = await readJson<{ actor?: string }>(request);
  if (!body?.actor) return badRequest("actor is required");
  const auth = await authorize(body.actor, "readiness.record");
  if (!auth.ok) return auth.response;
  return runCommand(id, (repo) => repo.recordContainerReady(containerId, auth.displayName));
}
