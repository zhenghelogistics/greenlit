import { badRequest, readJson, runCommand } from "../../../../../../lib/command";

/**
 * §12. "The controller decides which value becomes current, and that decision
 * is audited."
 *
 * Choosing `extracted` writes the extracted value; `stored` leaves what was
 * there. Either way the discrepancy closes with who decided and when, so the
 * decision survives the screen that showed it.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{ field?: string; choice?: string; actor?: string }>(request);

  if (!body?.actor) return badRequest("actor is required; §13 forbids anonymous decisions");
  if (!body.field?.trim()) return badRequest("field is required");
  if (body.choice !== "stored" && body.choice !== "extracted") {
    return badRequest("choice must be stored or extracted");
  }

  return runCommand(id, (repo) =>
    repo.resolveDiscrepancy(id, body.field!, body.choice as "stored" | "extracted", body.actor!));
}
