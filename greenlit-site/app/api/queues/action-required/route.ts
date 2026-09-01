import { getJobService, jsonError } from "../../../../lib/greenlit";

/**
 * §26.2. The controller's default working screen, ordered by the §25.1
 * precedence ladder. Filterable by waiting_on, which §25.2 exists to make
 * possible: "show me everything waiting on us" is the first thing anyone asks
 * of this screen, and it cannot be answered by parsing action text.
 */
export async function GET(request: Request) {
  try {
    const param = new URL(request.url).searchParams.get("waitingOn");
    const waitingOn =
      param === "US" || param === "CUSTOMER" || param === "CARRIER" ? param : undefined;
    const jobs = await getJobService().actionRequired(waitingOn);
    return Response.json({ jobs, waitingOn: waitingOn ?? "ALL" });
  } catch (error) {
    return jsonError(error);
  }
}
