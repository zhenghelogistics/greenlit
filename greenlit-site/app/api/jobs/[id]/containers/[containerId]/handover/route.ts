import { authorize, runCommand } from "../../../../../../../lib/command";

/**
 * Put this container on the controller's board.
 *
 * Operations only, and deliberately one-way: there is no DELETE. Withdrawing a
 * handover because a later edit re-opened a gap makes rows vanish from the
 * controller's board mid-plan with no explanation, so the gap is surfaced
 * instead, to the person best placed to chase it.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; containerId: string }> }) {
  const { id, containerId } = await ctx.params;
  const auth = await authorize("handover.record");
  if (!auth.ok) return auth.response;
  return runCommand(id, (repo) => repo.handContainerToController(containerId, auth.displayName));
}
