import { authorize, runCommand } from "../../../../../lib/command";
import { getJobService } from "../../../../../lib/greenlit";

/**
 * Operations confirm the job is fully gathered.
 *
 * Refused while anything is outstanding. The outstanding list is derived, so
 * the check is made here against the same answer the screen shows rather than
 * trusting a disabled button: a disabled button is a suggestion, and this is
 * the only place that can make it a rule.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorize("job.edit");
  if (!auth.ok) return auth.response;

  const view = await getJobService().getJob(id);
  const outstanding = view?.documentGaps ?? [];
  if (outstanding.length > 0) {
    return Response.json({
      error: `Still outstanding: ${outstanding.map((g: { field: string }) => g.field).join(", ")}.`,
    }, { status: 400 });
  }

  return runCommand(id, (repo) => repo.markDocumentsComplete(id, auth.displayName));
}
