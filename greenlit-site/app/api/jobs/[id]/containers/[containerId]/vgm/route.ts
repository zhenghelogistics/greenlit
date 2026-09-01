import { badRequest, readJson, runCommand } from "../../../../../../../lib/command";
import { getRepository } from "../../../../../../../lib/greenlit";
import { isVgmPlausible } from "@greenlit/engine";

/**
 * §43. VGM must be validated as plausible. A VGM at or below tare is
 * impossible and raises a discrepancy rather than being stored.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; containerId: string }> }) {
  const { id, containerId } = await ctx.params;
  const body = await readJson<{ vgm?: number; actor?: string }>(request);
  if (!body?.actor) return badRequest("actor is required");
  if (typeof body.vgm !== "number" || body.vgm <= 0) return badRequest("vgm must be a positive number");

  const container = (await getRepository().listContainersForExportJob(id))
    .find((c) => c.exportContainerId === containerId);
  if (!container) return Response.json({ error: `Unknown container ${containerId}` }, { status: 404 });

  if (container.tareWeightKg !== null && !isVgmPlausible(body.vgm, container.tareWeightKg)) {
    return Response.json({
      error: "VGM discrepancy",
      detail: `VGM ${body.vgm}kg is at or below tare ${container.tareWeightKg}kg, which is impossible`,
    }, { status: 422 });
  }

  return runCommand(id, (repo) => repo.recordVgm(containerId, body.vgm!, body.actor!));
}
