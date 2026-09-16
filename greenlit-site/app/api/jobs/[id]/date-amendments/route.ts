import { authorize, badRequest, readJson, runCommand } from "../../../../../lib/command";
import { getRepository, jsonError } from "../../../../../lib/greenlit";
import { AMENDABLE_DATE_FIELDS, DATE_AMENDMENT_REASON } from "@greenlit/engine";

/**
 * §13.1. Why a date moved.
 *
 * The audit stream records that a date changed and who changed it. It has
 * nowhere to record *why*, and why is the entire content of the conversation a
 * controller has when the customer rings to ask. So amendments are their own
 * log: append-only, each carrying a reason code, and never edited — a wrong
 * entry is corrected by a further amendment rather than by rewriting the first.
 *
 * All of this existed on the port and in the engine with no route reaching it,
 * which meant a date could be changed through the job PATCH with no reason
 * attached at all. That is the case §13.1 exists to prevent.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorize("tracker.view");
  if (!auth.ok) return auth.response;

  try {
    return Response.json({ amendments: await getRepository().listDateAmendments(id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{
    entityType?: string; entityId?: string; dateField?: string;
    newValue?: string | null; reasonCode?: string; reasonNote?: string;
  }>(request);
  if (!body) return badRequest("A JSON body is required");

  const auth = await authorize("job.edit");
  if (!auth.ok) return auth.response;

  const field = body.dateField;
  if (!field || !AMENDABLE_DATE_FIELDS.includes(field as typeof AMENDABLE_DATE_FIELDS[number])) {
    return badRequest(`dateField must be one of ${AMENDABLE_DATE_FIELDS.join(", ")}`);
  }
  if (!body.reasonCode
    || !DATE_AMENDMENT_REASON.includes(body.reasonCode as typeof DATE_AMENDMENT_REASON[number])) {
    return badRequest(
      "§13.1: a date cannot be changed without a reason code. One of "
      + DATE_AMENDMENT_REASON.join(", "));
  }
  // The engine refuses this too. Refusing here as well means the person gets
  // the sentence rather than a 500 from somewhere further down.
  if (body.reasonCode === "OTHER" && !body.reasonNote?.trim()) {
    return badRequest("§13.1: reason code OTHER requires a note saying what happened");
  }

  const entityType = body.entityType ?? "job";
  if (!["job", "container", "movement"].includes(entityType)) {
    return badRequest("entityType must be job, container or movement");
  }

  return runCommand(id, async (repo) => {
    await repo.amendDate({
    entityType: entityType as "job" | "container" | "movement",
    // A container or movement date belongs to that record, not to the job the
    // URL names; the job id is what the command reloads afterwards.
    entityId: body.entityId?.trim() || id,
    dateField: field,
    newValue: body.newValue ?? null,
    reasonCode: body.reasonCode!,
    reasonNote: body.reasonNote?.trim() || null,
    }, auth.displayName);
  });
}
