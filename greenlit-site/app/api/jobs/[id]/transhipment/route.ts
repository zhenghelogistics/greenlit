import { authorize, badRequest, readJson, runCommand } from "../../../../../lib/command";

/** §44.1. "We checked" is not sufficient; the answer is stored with a user. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{ status?: string }>(request);
  if (!body) return badRequest("A JSON body is required");
  const auth = await authorize("transhipment.record");
  if (!auth.ok) return auth.response;
  const status = body.status;
  if (status !== "AVAILABLE" && status !== "NOT_AVAILABLE") {
    return badRequest("status must be AVAILABLE or NOT_AVAILABLE");
  }
  return runCommand(id, (repo) => repo.recordTranshipment(id, status, auth.displayName));
}
