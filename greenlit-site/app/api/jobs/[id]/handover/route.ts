import { authorize, runCommand } from "../../../../../lib/command";
import { getJobService } from "../../../../../lib/greenlit";

/**
 * Pass a job to the controller.
 *
 * An import hands over every container that is ready, and names what holds
 * back the rest. Operations asked for one action on the job; the per-box
 * handover stays for a box that becomes ready later. The store re-checks each
 * box itself, so this cannot hand over one the gate refuses.
 *
 * An export hands over as a job.
 *
 * Job level, unlike the per-container handover on imports: an export has no
 * per-box paperwork gate the way an import has permits, so what holds one
 * container back holds the job back.
 *
 * One-way, for the same reason the import one is. Withdrawing a handover
 * because a later edit reopened a gap makes a job vanish from the controller's
 * board mid-plan with no explanation; the gap is surfaced instead, to whoever
 * can chase it.
 *
 * CMS is not a condition here. It frequently cannot be done until the day of
 * collection, and holding the job back would keep it off the board for exactly
 * the period the controller needs to plan around it.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorize("handover.record");
  if (!auth.ok) return auth.response;
  return runCommand(id, async (repo) => {
    const importJob = await repo.getImportJob(id);
    if (!importJob) return repo.handExportToController(id, auth.displayName);

    const view = await getJobService().getJob(id);
    const waiting = (view?.containers ?? []).filter((c) => !c.handedOver);
    const ready = waiting.filter((c) => c.readyForHandover);
    if (ready.length === 0) {
      const held = waiting.map((c) => `${c.containerNumber ?? "A container"}: `
        + [...(view?.handoverShipmentGaps ?? []), ...c.handoverGaps].join(", "));
      throw new Error(waiting.length
        ? `Nothing is ready to hand over. ${held.join("; ")}`
        : "Every container on this job is already handed over.");
    }
    for (const c of ready) await repo.handContainerToController(c.containerId, auth.displayName);
  });
}
