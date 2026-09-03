import { getJobService, jsonError } from "../../../lib/greenlit";

/**
 * §35. The chassis fleet, with every status derived from job records.
 *
 * §35.6: occupancy equals job duration, so this is the real ceiling on
 * concurrent jobs — the figure the operation has never been able to see.
 */
export async function GET() {
  try {
    return Response.json({ fleet: await getJobService().fleet() });
  } catch (error) {
    return jsonError(error);
  }
}
