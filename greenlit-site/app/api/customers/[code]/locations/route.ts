import { defaultLocation, selectableLocations } from "@greenlit/engine";
import { authorize, badRequest, readJson } from "../../../../../lib/command";
import { currentPrincipal } from "../../../../../lib/auth";
import { getRepository, jsonError } from "../../../../../lib/greenlit";

/**
 * §9.3. Where this customer receives and stuffs.
 *
 * Read by job creation so the address is chosen rather than typed. The whole
 * list comes back including inactive sites, with the selectable ones named
 * separately: an old job points at a site that has closed, and its history
 * should still say where it went.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    if (!await currentPrincipal()) {
      return Response.json({ error: "Sign in to continue" }, { status: 401 });
    }

    const locations = await getRepository().listCustomerLocations(code);
    return Response.json({
      locations,
      selectable: selectableLocations(locations),
      // Null when there are several and none is marked, because guessing
      // between warehouses sends a container to the wrong one.
      suggested: defaultLocation(locations),
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** §9.3. Add a site to the customer's record so the next booking reuses it. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const body = await readJson<{
      label?: string; address?: string; isDefault?: boolean;
      doubleMountingPermitted?: boolean; standbyUsual?: boolean;
    }>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("masterData.manage");
    if (!auth.ok) return auth.response;

    const location = await getRepository().addCustomerLocation(code, {
      label: body.label,
      address: body.address,
      isDefault: body.isDefault ?? false,
      doubleMountingPermitted: body.doubleMountingPermitted ?? true,
      standbyUsual: body.standbyUsual ?? false,
    }, auth.displayName);

    return Response.json({ location }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    // The engine's own wording — it already says what is wrong in the words a
    // person would use, and restating it here would let the two drift.
    if (/needs an address|name the customer would recognise/.test(message)) {
      return badRequest(message);
    }
    return jsonError(error);
  }
}

/** §9.3. Correct a site, make it the default, or take it out of use. */
export async function PATCH(request: Request) {
  try {
    const body = await readJson<{
      locationId?: string; label?: string; address?: string; isDefault?: boolean;
      doubleMountingPermitted?: boolean; standbyUsual?: boolean; active?: boolean;
    }>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("masterData.manage");
    if (!auth.ok) return auth.response;
    if (!body.locationId) return badRequest("locationId is required");

    const { locationId, ...changes } = body;
    await getRepository().amendCustomerLocation(locationId, changes, auth.displayName);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    if (/needs an address|name the customer would recognise/.test(message)) {
      return badRequest(message);
    }
    return jsonError(error);
  }
}
