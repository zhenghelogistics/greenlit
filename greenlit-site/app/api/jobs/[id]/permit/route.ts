import { authorize, badRequest, readJson, runCommand } from "../../../../../lib/command";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{ permitNumber?: string; actor?: string }>(request);
  if (!body?.actor) return badRequest("actor is required");
  const auth = await authorize(body.actor, "permit.confirm");
  if (!auth.ok) return auth.response;
  if (!body.permitNumber?.trim()) return badRequest("permitNumber is required");
  return runCommand(id, (repo) => repo.recordPermitReceived(id, body.permitNumber!, auth.displayName));
}
