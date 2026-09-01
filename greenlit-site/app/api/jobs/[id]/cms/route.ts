import { badRequest, readJson, runCommand } from "../../../../../lib/command";

/** §40.2. NOT_REQUIRED is a permissioned choice and requires a reason. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{ status?: string; actor?: string; reason?: string }>(request);
  if (!body?.actor) return badRequest("actor is required; §13 forbids anonymous changes");

  const status = body.status;
  if (status !== "COMPLETED" && status !== "NOT_REQUIRED") {
    return badRequest("status must be COMPLETED or NOT_REQUIRED");
  }
  if (status === "NOT_REQUIRED" && !body.reason?.trim()) {
    return badRequest("§40.2: NOT_REQUIRED requires a reason");
  }
  return runCommand(id, (repo) => repo.recordCms(id, status, body.actor!, body.reason));
}
