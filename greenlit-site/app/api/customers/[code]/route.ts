import { authorize, badRequest, readJson } from "../../../../lib/command";
import { getJobService, getRepository, jsonError } from "../../../../lib/greenlit";

/**
 * One company, with its jobs.
 *
 * ADR-0007: opening a company shows its work in the order it happened, which
 * is how a retainer operation is actually read.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const customer = await getRepository().getCustomerByCode(code);
    if (!customer) return Response.json({ error: `Unknown customer ${code}` }, { status: 404 });

    const jobs = (await getJobService().listJobs())
      .filter((j) => j.customer === customer.companyName);

    return Response.json({ customer, jobs });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Amend a customer.
 *
 * Everything but the code, which is immutable once issued: every job reference
 * already printed is built from it.
 *
 * There was no way to correct a customer at all — three fields at creation and
 * read-only thereafter — so a misspelled company name meant creating a second
 * customer, which in a retainer operation is the one mistake worth the most to
 * prevent (ADR-0007).
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("masterData.manage");
    if (!auth.ok) return auth.response;

    if ("code" in body) {
      return badRequest("A customer's code cannot be changed — job references depend on it.");
    }

    // Named rather than spread: a PATCH that forwards whatever it is given
    // lets a caller write a column nobody meant to expose.
    const allowed = [
      "companyName", "shortName", "billingName",
      "defaultContact", "emailDomains", "accountStatus", "notes",
      "requiresPermit",
    ] as const;
    const changes: Record<string, unknown> = {};
    for (const field of allowed) if (field in body) changes[field] = body[field];
    if (Object.keys(changes).length === 0) return badRequest("Nothing to change");

    if (changes.companyName !== undefined && !String(changes.companyName).trim()) {
      return badRequest("A company name is required");
    }

    const customer = await getRepository().amendCustomer(code, changes, auth.displayName);
    return Response.json({ customer });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Remove a customer from the master.
 *
 * For the customer who was entered twice, or entered and never traded with.
 * The engine refuses once there are jobs, because every reference already
 * issued is built from the code — see `canDeleteCustomer`, which also carries
 * the sentence explaining what to do instead.
 *
 * 409 rather than 400: the request is well-formed and the answer is about the
 * state of the customer, which is a thing that can change.
 */
export async function DELETE(_request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;

    const auth = await authorize("masterData.manage");
    if (!auth.ok) return auth.response;

    const customer = await getRepository().getCustomerByCode(code);
    if (!customer) return Response.json({ error: `Unknown customer ${code}` }, { status: 404 });

    await getRepository().deleteCustomer(code, auth.displayName);
    return Response.json({ deleted: customer.code });
  } catch (error) {
    // The refusal is the engine's sentence, and it is written to be read by
    // the person who pressed the button rather than decoded from a status.
    const message = error instanceof Error ? error.message : String(error);
    if (/has \d+ job/.test(message)) return Response.json({ error: message }, { status: 409 });
    return jsonError(error);
  }
}
