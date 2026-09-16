import { authorize, badRequest, readJson, runCommand } from "../../../../../../lib/command";

/**
 * §29. Correct a container's details.
 *
 * Only what someone typed. Container status, location and the free-time
 * countdown are computed from these and stay unwritable (§54); the free-time
 * terms themselves have their own route, because §34 decides which figures
 * apply from the model and will not store two shapes at once.
 */
export async function PATCH(request: Request, ctx: {
  params: Promise<{ id: string; containerId: string }>;
}) {
  const { id, containerId } = await ctx.params;
  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return badRequest("A JSON body is required");

  const auth = await authorize("job.edit");
  if (!auth.ok) return auth.response;

  const AMENDABLE = [
    "containerNumber", "containerSize", "sealNumber",
    "grossWeight", "packageCount", "packageType", "emptyReturnYard",
  ] as const;

  const changes: Record<string, unknown> = {};
  for (const field of AMENDABLE) {
    if (!(field in body)) continue;
    const value = body[field];
    changes[field] = value === "" || value == null ? null : value;
  }
  if (Object.keys(changes).length === 0) {
    return badRequest(
      `Nothing amendable was sent. This accepts: ${AMENDABLE.join(", ")}. `
      + "Free-time terms have their own route, and status is computed.",
    );
  }

  // §46. An export container is a different record with different amendable
  // fields, so the job decides which one is being corrected.
  return runCommand(id, async (repo) => {
    if (await repo.getExportJob(id)) {
      await repo.amendExportContainer(containerId, {
        sizeType: changes.sizeType as string | undefined,
        stuffingLocation: changes.stuffingLocation as string | null | undefined,
      }, auth.displayName);
      return;
    }
    await repo.amendContainer(containerId, changes, auth.displayName);
  });
}

/** §29. Remove a container that should not be on the job. */
export async function DELETE(request: Request, ctx: {
  params: Promise<{ id: string; containerId: string }>;
}) {
  const { id, containerId } = await ctx.params;
  const auth = await authorize("job.edit");
  if (!auth.ok) return auth.response;

  return runCommand(id, async (repo) => {
    if (await repo.getExportJob(id)) {
      await repo.removeExportContainer(containerId, auth.displayName);
      return;
    }
    await repo.removeContainerFromJob(containerId, auth.displayName);
  });
}
