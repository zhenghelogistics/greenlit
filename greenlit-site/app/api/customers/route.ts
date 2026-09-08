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
    const actor = (body as { actor?: string } | null)?.actor;
    if (!actor) return badRequest("actor is required");

    const auth = await authorize(actor, "masterData.manage");
    if (!auth.ok) return auth.response;

    if (!body?.code?.trim()) return badRequest("code is required");
    if (!body.companyName?.trim()) return badRequest("companyName is required");

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
