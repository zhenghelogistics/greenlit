import { authorize, badRequest, readJson, runCommand } from "../../../../../lib/command";

/**
 * Add a note to the job's log.
 *
 * The demo's "+ Add Job Note": something a person needs the next person to
 * know that no field holds. Kept on the same log as every other change, with
 * who wrote it and when.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{ text?: string }>(request);
  if (!body?.text?.trim()) return badRequest("Write the note first.");
  if (body.text.length > 2000) return badRequest("Keep a note under 2,000 characters.");

  const auth = await authorize("job.edit");
  if (!auth.ok) return auth.response;

  return runCommand(id, (repo) => repo.addJobNote(id, body.text!, auth.displayName));
}
