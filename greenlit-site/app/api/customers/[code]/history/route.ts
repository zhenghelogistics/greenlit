import { currentPrincipal } from "../../../../../lib/auth";
import { getRepository, jsonError } from "../../../../../lib/greenlit";

/**
 * §13. What has changed about this customer, and who changed it.
 *
 * The screen has had a Change History tab since the customer master was built
 * and it has always said the API does not publish this — which was true, and
 * meant nobody could see who added a customer or corrected an address.
 *
 * Keyed by code, which is how every customer event is recorded. Creation used
 * to key itself by the lowercase id under the event name `job.created`, so
 * even once this existed the one row saying who made the customer would not
 * have appeared in it.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    if (!await currentPrincipal()) {
      return Response.json({ error: "Sign in to continue" }, { status: 401 });
    }

    const events = await getRepository().listAuditEvents(code.trim().toUpperCase());
    // Newest first: a history is read to find out what just happened far more
    // often than to read it from the beginning.
    return Response.json({
      events: [...events].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    });
  } catch (error) {
    return jsonError(error);
  }
}
