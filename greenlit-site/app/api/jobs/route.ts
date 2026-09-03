import { authorize, badRequest, readJson } from "../../../lib/command";
import { getJobService, getRepository, jsonError } from "../../../lib/greenlit";

/**
 * Every job, both domains, each carrying its derived values.
 *
 * §54: job_status, next_action_required, blocking_reason, waiting_on,
 * current_location and the gate results are **read-only computed values**.
 * There is deliberately no PATCH here — if any were writable through the API,
 * the engine could be bypassed, and it would be.
 */
export async function GET() {
  try {
    const jobs = await getJobService().listJobs();
    return Response.json({ jobs });
  } catch (error) {
    return jsonError(error);
  }
}


/**
 * Create a job against a customer.
 *
 * The reference is issued server-side and scoped to the customer (ADR-0007),
 * so it cannot be chosen, guessed, or collided with. Content is deliberately
 * permissive: §26.1's Incomplete queue exists because a job legitimately
 * starts before its mandatory information is known.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<{
      domain?: string; customerCode?: string; actor?: string;
      [key: string]: unknown;
    }>(request);

    if (!body?.actor) return badRequest("actor is required");
    const auth = await authorize(body.actor, "job.create");
    if (!auth.ok) return auth.response;

    if (!body.customerCode?.trim()) return badRequest("customerCode is required");
    if (body.domain !== "IMPORT" && body.domain !== "EXPORT") {
      return badRequest("domain must be IMPORT or EXPORT");
    }

    const repo = getRepository();
    const { domain, actor, ...draft } = body;
    void domain; void actor;

    const created = body.domain === "IMPORT"
      ? await repo.createImportJob(draft as never, auth.displayName)
      : await repo.createExportJob(draft as never, auth.displayName);

    const jobId = "jobId" in created ? created.jobId : created.exportJobId;
    const job = await getJobService().getJob(jobId);
    return Response.json({ job }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/^Unknown customer/.test(message)) {
      return Response.json({ error: message }, { status: 400 });
    }
    return jsonError(error);
  }
}
