import { badRequest, readJson, runCommand } from "../../../../../lib/command";

/** §27.5: no Portnet API in MVP, so a person confirms and is recorded doing so. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{ actor?: string }>(request);
  if (!body?.actor) return badRequest("actor is required");
  return runCommand(id, (repo) => repo.recordPortnetReleased(id, body.actor!));
}
