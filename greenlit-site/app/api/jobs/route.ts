import { getJobService, jsonError } from "../../../lib/greenlit";

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
