import { getRepository } from "../../../../lib/greenlit";

/**
 * The reference the next job for a customer would be given.
 *
 * Customer-scoped (ADR-0007), so there is nothing to show until a customer is
 * chosen — which is honest rather than awkward: the number *is* the customer's
 * next number, and inventing a placeholder before one is picked would show
 * something that is never what the job gets.
 *
 * A preview and deliberately not a reservation. Nothing is consumed, so two
 * people looking at an empty form see the same number and only one of them
 * gets it. Reserving on page load would burn a reference every time somebody
 * opened the form and changed their mind.
 */
export async function GET(request: Request) {
  const customerCode = new URL(request.url).searchParams.get("customer")?.trim();
  if (!customerCode) return Response.json({ jobNumber: "" });

  try {
    return Response.json({ jobNumber: await getRepository().nextReferenceFor(customerCode) });
  } catch {
    // A preview that cannot be worked out is simply not shown. It is a
    // convenience, and failing it should never stop a job being created.
    return Response.json({ jobNumber: "" });
  }
}
