import { authorize, runCommand } from "../../../../../lib/command";

/**
 * Pass an export job to the controller.
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
  return runCommand(id, (repo) => repo.handExportToController(id, auth.displayName));
}
