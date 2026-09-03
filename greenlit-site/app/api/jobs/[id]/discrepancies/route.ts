import { badRequest, readJson, runCommand } from "../../../../../lib/command";
import { getJobService, jsonError } from "../../../../../lib/greenlit";

/** §12. Conflicts awaiting a decision on this job. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const job = await getJobService().getJob(id);
    if (!job) return Response.json({ error: `Unknown job ${id}` }, { status: 404 });
    return Response.json({ discrepancies: job.discrepancies });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * §12. Raise a conflict found while reconciling an extraction.
 *
 * Raised rather than applied: the stored value stays until someone decides,
 * and the record outlives the screen that found it.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson<{
    field?: string; storedValue?: unknown; extractedValue?: unknown;
    source?: string; confidence?: number; reason?: string; actor?: string;
  }>(request);

  if (!body?.actor) return badRequest("actor is required");
  if (!body.field?.trim()) return badRequest("field is required");
  if (!body.source?.trim()) return badRequest("source is required; §11.1 requires provenance");

  return runCommand(id, (repo) => repo.raiseDiscrepancy(id, {
    field: body.field!,
    storedValue: body.storedValue ?? null,
    extractedValue: body.extractedValue ?? null,
    source: body.source!,
    confidence: typeof body.confidence === "number" ? body.confidence : 0,
    detectedAt: new Date().toISOString(),
    reason: body.reason ?? `Extracted ${body.field} conflicts with the stored value`,
  }, body.actor!));
}
