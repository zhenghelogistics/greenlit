import { authorize, badRequest, readJson } from "../../../../../../lib/command";
import { getRepository, jsonError } from "../../../../../../lib/greenlit";

/**
 * §24. Which containers this permit covers.
 *
 * The list replaces whatever it covered before, because "copy to selected"
 * states the intended relationship for the whole permit: a container the
 * controller has just unticked must stop being covered, and an add-only call
 * could never say so.
 */
export async function PUT(request: Request, ctx: {
  params: Promise<{ permitId: string }>;
}) {
  try {
    const { permitId } = await ctx.params;
    const body = await readJson<{ containerIds?: string[] }>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("permit.confirm");
    if (!auth.ok) return auth.response;
    if (!Array.isArray(body.containerIds)) {
      return badRequest("containerIds must be a list, empty to cover nothing");
    }

    await getRepository().linkPermitToContainers(permitId, body.containerIds, auth.displayName);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    return jsonError(error);
  }
}

export async function DELETE(request: Request, ctx: {
  params: Promise<{ permitId: string }>;
}) {
  try {
    const { permitId } = await ctx.params;
    const auth = await authorize("permit.confirm");
    if (!auth.ok) return auth.response;

    await getRepository().removePermit(permitId, auth.displayName);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    return jsonError(error);
  }
}
