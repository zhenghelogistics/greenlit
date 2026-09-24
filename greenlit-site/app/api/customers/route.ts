import { duplicateCustomerName } from "@greenlit/engine";
import { authorize, badRequest, readJson } from "../../../lib/command";
import { getRepository, jsonError } from "../../../lib/greenlit";

/** The customer master. Retainer customers are the organising unit (ADR-0007). */
export async function GET() {
  try {
    return Response.json({ customers: await getRepository().listCustomers() });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Create a customer.
 *
 * The code is chosen by a person, validated unique, and immutable once issued —
 * every job reference already printed depends on it.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<{
      code?: string; companyName?: string; shortName?: string; emailDomains?: string[];
    }>(request);
  if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("masterData.manage");
    if (!auth.ok) return auth.response;

    if (!body?.code?.trim()) return badRequest("code is required");
    if (!body.companyName?.trim()) return badRequest("companyName is required");

    // A retainer business organises everything around the customer record, so
    // a second copy of one is worse than it looks: the duplicate starts with
    // no saved locations and no standing instructions, and whoever creates the
    // next job picks whichever came up first.
    const clash = duplicateCustomerName(
      body.companyName, await getRepository().listCustomers());
    if (clash) return badRequest(clash);

    const customer = await getRepository().createCustomer({
      code: body.code,
      companyName: body.companyName,
      shortName: body.shortName ?? null,
      emailDomains: body.emailDomains ?? [],
    }, auth.displayName);

    return Response.json({ customer }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    // Validation failures from the engine are the caller's problem, not ours.
    if (/required|already|two to six|valid email/.test(message)) {
      return Response.json({ error: message }, { status: 400 });
    }
    return jsonError(error);
  }
}
