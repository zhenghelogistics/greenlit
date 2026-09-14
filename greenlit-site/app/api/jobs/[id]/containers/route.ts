import { authorize, badRequest, readJson, runCommand } from "../../../../../lib/command";

/**
 * §29. Add a container to a job that already exists.
 *
 * A second container turns out to be on the same bill, or one was missed at
 * intake. The screen has always let someone add one; it wrote nothing down.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{
    containerNumber?: string; sizeType?: string; sealNumber?: string;
    grossWeight?: number; packageCount?: number; packageType?: string;
  }>(request);
  if (!body) return badRequest("A JSON body is required");

  const auth = await authorize("job.edit");
  if (!auth.ok) return auth.response;

  return runCommand(id, async (repo) => {
    await repo.addContainerToJob(id, {
      containerNumber: body.containerNumber ?? null,
      sizeType: body.sizeType ?? null,
      sealNumber: body.sealNumber ?? null,
      grossWeight: body.grossWeight ?? null,
      packageCount: body.packageCount ?? null,
      packageType: body.packageType ?? null,
    }, auth.displayName);
  });
}
