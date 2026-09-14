import { authorize, badRequest, readJson, runCommand } from "../../../../../../lib/command";

/**
 * §19 and §20. When it is planned for and who is driving, or what happened.
 *
 * Two separate claims through one route, distinguished by what is sent: a plan
 * is an intention that can move, an outcome is a fact about the past that
 * should not. They stay separate underneath — the port has a method for each —
 * so a caller cannot quietly turn one into the other.
 */
export async function PATCH(request: Request, ctx: {
  params: Promise<{ id: string; movementId: string }>;
}) {
  const { id, movementId } = await ctx.params;
  const body = await readJson<{
    plannedDate?: string; plannedTime?: string; truck?: string; driver?: string;
    movementStatus?: string; actualCollectionAt?: string; actualDeliveryAt?: string;
  }>(request);
  if (!body) return badRequest("A JSON body is required");

  const plan = pick(body, ["plannedDate", "plannedTime", "truck", "driver"]);
  const progress = pick(body, ["movementStatus", "actualCollectionAt", "actualDeliveryAt"]);

  if (Object.keys(plan).length === 0 && Object.keys(progress).length === 0) {
    return badRequest(
      "Send a plan (plannedDate, plannedTime, truck, driver) or progress "
      + "(movementStatus, actualCollectionAt, actualDeliveryAt).",
    );
  }

  // Scheduling and recording an outcome are different permissions because they
  // are different acts: one arranges work, the other asserts it happened.
  const needed = Object.keys(progress).length > 0 ? "movement.update" : "movement.schedule";
  const auth = await authorize(needed);
  if (!auth.ok) return auth.response;

  return runCommand(id, async (repo) => {
    if (Object.keys(plan).length > 0) {
      await repo.scheduleMovement(movementId, plan, auth.displayName);
    }
    if (Object.keys(progress).length > 0) {
      await repo.recordMovementProgress(movementId, progress, auth.displayName);
    }
  });
}

/** §18.4. Cancel it, with a reason, keeping the movement and retiring its number. */
export async function DELETE(request: Request, ctx: {
  params: Promise<{ id: string; movementId: string }>;
}) {
  const { id, movementId } = await ctx.params;
  const body = await readJson<{ reason?: string }>(request);

  const auth = await authorize("movement.cancel");
  if (!auth.ok) return auth.response;

  if (!body?.reason?.trim()) {
    return badRequest("A cancellation needs a reason. It stays on the job's history.");
  }

  return runCommand(id, (repo) =>
    repo.cancelMovement(movementId, body.reason!.trim(), auth.displayName));
}

/** Only the keys actually sent, so absent stays different from null. */
function pick<T extends object>(body: T, keys: readonly (keyof T)[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (key in body) out[key as string] = body[key];
  return out;
}
