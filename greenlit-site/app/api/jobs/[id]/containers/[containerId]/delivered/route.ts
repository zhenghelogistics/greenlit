import { authorize, runCommand } from "../../../../../../../lib/command";

/** One of the four facts the controller's board is built on. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; containerId: string }> }) {
  const { id, containerId } = await ctx.params;
  const auth = await authorize("readiness.record");
  if (!auth.ok) return auth.response;
  return runCommand(id, (repo) => repo.recordDelivered(containerId, auth.displayName));
}
