import { authorize, runCommand } from "../../../../../../../lib/command";

/** §43. The customer confirms the container is ready after stuffing. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; containerId: string }> }) {
  const { id, containerId } = await ctx.params;
  const auth = await authorize("readiness.record");
  if (!auth.ok) return auth.response;
  return runCommand(id, (repo) => repo.recordContainerReady(containerId, auth.displayName));
}
