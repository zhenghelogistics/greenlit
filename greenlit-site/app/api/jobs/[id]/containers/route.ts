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
    stuffingLocation?: string; isReefer?: boolean;
    temperatureMode?: string; temperatureSetpointC?: number;
  }>(request);
  if (!body) return badRequest("A JSON body is required");

  const auth = await authorize("job.edit");
  if (!auth.ok) return auth.response;

  return runCommand(id, async (repo) => {
    /**
     * §46. An export container is a different record, not the same one with a
     * flag on it.
     *
     * This called addContainerToJob whatever the job was, and that writes to
     * the import `containers` table. On an export booking it wrote a row
     * against a job id that table has never heard of — so Add Container was
     * broken on every export job, and had been since the route was written.
     *
     * The two are genuinely different: an import container arrives with a
     * number, a seal and a weight, and an export slot is booked as a size and
     * a stuffing location, with the identity captured later under §39.
     */
    const isExport = Boolean(await repo.getExportJob(id));

    if (isExport) {
      if (!body.sizeType?.trim()) {
        throw new Error("An export container is booked as a size, so sizeType is required");
      }
      await repo.addExportContainer(id, {
        sizeType: body.sizeType,
        stuffingLocation: body.stuffingLocation ?? null,
        isReefer: body.isReefer ?? false,
        temperatureMode: body.temperatureMode ?? null,
        temperatureSetpointC: body.temperatureSetpointC ?? null,
      }, auth.displayName);
      return;
    }

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
