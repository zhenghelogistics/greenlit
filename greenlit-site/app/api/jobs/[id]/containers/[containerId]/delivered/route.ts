import { authorize, runCommand } from "../../../../../../../lib/command";
import { getJobService } from "../../../../../../../lib/greenlit";
import { refuseEvent } from "@greenlit/engine";

/**
 * The container reached the customer.
 *
 * Refused, not warned, when it could not have. A box delivered before it was
 * discharged, or with no trip ever planned, did not teleport — somebody
 * clicked the wrong row, and the date would then sit on the job with nothing
 * able to contradict it.
 *
 * Checked here rather than only on the screen, because a disabled button is a
 * suggestion and this is the only place that can make it a rule.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; containerId: string }> }) {
  const { id, containerId } = await ctx.params;
  const auth = await authorize("readiness.record");
  if (!auth.ok) return auth.response;

  const view = await getJobService().getJob(id);
  const container = view?.containers?.find((c) => c.containerId === containerId);
  if (!container) return Response.json({ error: "No such container on this job." }, { status: 404 });

  const planned = (view?.movements ?? []).some((m) =>
    m.containerId === containerId && m.movementStatus !== "CANCELLED");

  const refusal = refuseEvent("DELIVER", {
    portnetReleased: true,
    dischargedAt: container.dischargedAt,
    deliveredAt: container.deliveredAt,
    emptyReadyAt: null,
    hasPlannedCollection: planned,
  });
  if (refusal) return Response.json({ error: refusal }, { status: 409 });

  return runCommand(id, (repo) => repo.recordDelivered(containerId, auth.displayName));
}
