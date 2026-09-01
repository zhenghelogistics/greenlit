import { getJobService, jsonError } from "../../../../lib/greenlit";

/** §26.1. Populated automatically by the mandatory field engine. */
export async function GET() {
  try {
    const jobs = await getJobService().incomplete();
    return Response.json({ jobs });
  } catch (error) {
    return jsonError(error);
  }
}
