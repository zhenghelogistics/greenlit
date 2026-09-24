import { authorize, runCommand } from "../../../../../../../lib/command";
import { getJobService } from "../../../../../../../lib/greenlit";
import { refuseEvent } from "@greenlit/engine";

/**
 * §36.3. The customer has finished with the container.
 *
 * Refused before the delivery is recorded. A customer cannot have emptied a
 * box that never reached them, so this is a misclick rather than an unusual
 * case — and unlike a date that merely looks odd, there is no reading of it
 * that is true.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; containerId: string }> }) {
  const { id, containerId } = await ctx.params;
  const auth = await authorize("readiness.record");
  if (!auth.ok) return auth.response;

  const view = await getJobService().getJob(id);
  const container = view?.containers?.find((c) => c.containerId === containerId);
  if (!container) return Response.json({ error: "No such container on this job." }, { status: 404 });

  const refusal = refuseEvent("EMPTY", {
    portnetReleased: true,
    dischargedAt: container.dischargedAt,
    deliveredAt: container.deliveredAt,
    emptyReadyAt: null,
  });
  if (refusal) return Response.json({ error: refusal }, { status: 409 });

  // §36.3. How the customer told us. "They said so" is not auditable; the
  // channel and the time are. MANUAL is the controller recording it themselves,
  // which is the honest default when nobody says how they heard.
  const CHANNELS = ["EMAIL", "WHATSAPP", "PHONE", "MANUAL"] as const;
  const body = await request.json().catch(() => ({}));
  const asked = String(body?.source ?? "").toUpperCase();
  const source = (CHANNELS as readonly string[]).includes(asked)
    ? asked as typeof CHANNELS[number]
    : "MANUAL";

  return runCommand(id, (repo) => repo.confirmEmptyReady(containerId, source, auth.displayName));
}
