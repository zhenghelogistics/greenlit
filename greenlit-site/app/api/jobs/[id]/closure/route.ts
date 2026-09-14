import { closureBlockers, reopenReasonProblem } from "@greenlit/engine";
import { authorize, badRequest, readJson, runCommand } from "../../../../../lib/command";
import { currentPrincipal } from "../../../../../lib/auth";
import { getRepository, getJobService, jsonError } from "../../../../../lib/greenlit";

/**
 * §33. What is still holding the job open.
 *
 * Asked before the close button is offered, so a controller sees the whole
 * list rather than discovering it one refusal at a time.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!await currentPrincipal()) {
      return Response.json({ error: "Sign in to continue" }, { status: 401 });
    }

    const job = await getJobService().getJob(id);
    if (!job) return Response.json({ error: `Unknown job ${id}` }, { status: 404 });

    const repo = getRepository();
    const [containers, movements, exceptions] = await Promise.all([
      repo.listContainersForImportJob(id),
      repo.listMovementsForJob(id),
      repo.listOpenExceptionsForJob(id),
    ]);

    const blockers = closureBlockers(containers, movements, exceptions.length);
    return Response.json({
      blockers,
      canClose: blockers.length === 0,
      closed: Boolean((job.record as { closedAt?: string | null }).closedAt),
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** §33. Close a finished job. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorize("job.close");
  if (!auth.ok) return auth.response;

  const repo = getRepository();
  const [containers, movements, exceptions] = await Promise.all([
    repo.listContainersForImportJob(id),
    repo.listMovementsForJob(id),
    repo.listOpenExceptionsForJob(id),
  ]);

  // Checked here, not only in the browser: a close that skipped the check
  // would stop the free-time countdown on a container still sitting out.
  const blockers = closureBlockers(containers, movements, exceptions.length);
  if (blockers.length > 0) {
    return Response.json({ error: "This job is not finished", blockers }, { status: 409 });
  }

  return runCommand(id, (r) => r.closeJob(id, auth.displayName));
}

/**
 * §33.2. Open a billed job again.
 *
 * A different permission, because closing is what makes a job billable and
 * reopening changes what has already been invoiced. Operations may close;
 * only management may undo it.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{ reason?: string }>(request);

  const auth = await authorize("job.reopen");
  if (!auth.ok) return auth.response;

  const problem = reopenReasonProblem(body?.reason ?? "");
  if (problem) return badRequest(problem);

  return runCommand(id, (r) => r.reopenJob(id, body!.reason!.trim(), auth.displayName));
}
