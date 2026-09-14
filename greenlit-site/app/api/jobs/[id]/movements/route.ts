import { authorize, badRequest, readJson, runCommand } from "../../../../../lib/command";

/**
 * §18. Plan a movement.
 *
 * The engine has had rules about movements being overdue since the beginning
 * and the role model has five movement permissions; there was never anything
 * to create one. Planning a trip on screen rewrote a copy in the browser.
 *
 * The reference is allocated by the store, not sent by the caller: §18 says
 * MOV-NNN is unique within the job and never reused after a cancellation, and
 * only the store can see what has already been issued.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{
    movementType?: string; containerId?: string;
    origin?: string; originType?: string;
    destination?: string; destinationType?: string;
    plannedDate?: string; plannedTime?: string;
  }>(request);
  if (!body) return badRequest("A JSON body is required");

  const auth = await authorize("movement.create");
  if (!auth.ok) return auth.response;

  // A movement with no route is not a movement. Refusing here beats storing a
  // row that the planning board cannot draw and nobody can drive.
  if (!body.movementType?.trim()) return badRequest("movementType is required");
  if (!body.origin?.trim()) return badRequest("An origin is required — where does it start?");
  if (!body.destination?.trim()) {
    return badRequest("A destination is required — where does it end?");
  }

  return runCommand(id, async (repo) => {
    await repo.createMovement({
      jobId: id,
      containerId: body.containerId ?? null,
      movementType: body.movementType!.trim(),
      origin: body.origin!.trim(),
      originType: body.originType ?? "OTHER",
      destination: body.destination!.trim(),
      destinationType: body.destinationType ?? "OTHER",
      plannedDate: body.plannedDate ?? null,
      plannedTime: body.plannedTime ?? null,
    }, auth.displayName);
  });
}
