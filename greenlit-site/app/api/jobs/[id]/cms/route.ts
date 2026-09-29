import { authorize, badRequest, readJson, runCommand } from "../../../../../lib/command";

/** §40.2. NOT_REQUIRED is a permissioned choice and requires a reason. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{ status?: string; reason?: string; movementId?: string }>(request);
  if (!body) return badRequest("A JSON body is required");
  const auth = await authorize("cms.record");
  if (!auth.ok) return auth.response;

  const status = body.status;
  if (status !== "COMPLETED" && status !== "NOT_REQUIRED") {
    return badRequest("status must be COMPLETED or NOT_REQUIRED");
  }
  if (status === "NOT_REQUIRED" && !body.reason?.trim()) {
    return badRequest("§40.2: NOT_REQUIRED requires a reason");
  }
  // §41. `movementId` names the empty collection this booking covers. Omitted
  // means the job, which is what a job with a single collection has always
  // meant. Completing one collection must never clear another's blocker.
  return runCommand(id, (repo) =>
    repo.recordCms(id, status, auth.displayName, body.reason, body.movementId));
}
