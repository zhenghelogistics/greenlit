import { badRequest, readJson, runCommand } from "../../../../../../../lib/command";

/**
 * §39. Container number, seal and tare are captured together after the empty
 * is collected. §29.1 validates the format and uppercases it.
 */
const CONTAINER_NUMBER = /^[A-Z]{4}[0-9]{7}$/;

export async function POST(request: Request, ctx: { params: Promise<{ id: string; containerId: string }> }) {
  const { id, containerId } = await ctx.params;
  const body = await readJson<{ containerNumber?: string; sealNumber?: string; tareWeightKg?: number; actor?: string }>(request);
  if (!body?.actor) return badRequest("actor is required");

  const containerNumber = body.containerNumber?.toUpperCase().replace(/\s+/g, "") ?? "";
  if (!CONTAINER_NUMBER.test(containerNumber)) {
    return badRequest("containerNumber must be four letters followed by seven digits");
  }
  if (!body.sealNumber?.trim()) return badRequest("sealNumber is required");
  if (typeof body.tareWeightKg !== "number" || body.tareWeightKg <= 0) {
    return badRequest("tareWeightKg must be a positive number");
  }

  return runCommand(id, (repo) => repo.captureContainerIdentity(containerId, {
    containerNumber,
    sealNumber: body.sealNumber!.trim(),
    tareWeightKg: body.tareWeightKg!,
  }, body.actor!));
}
