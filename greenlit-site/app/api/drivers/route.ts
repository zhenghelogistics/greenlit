import { authorize, badRequest, readJson } from "../../../lib/command";
import { getRepository, jsonError } from "../../../lib/greenlit";

/**
 * Drivers on file, and adding or changing one.
 *
 * The demo's Drivers & Vehicles lists every driver with their vehicle, so the
 * controller can see who is free; the plan form offers the same names.
 */
export async function GET() {
  try {
    return Response.json({ drivers: await getRepository().listDrivers() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ driverId?: unknown; name?: unknown; vehicle?: unknown; active?: unknown }>(request);
    if (typeof body?.name !== "string" || !body.name.trim()) return badRequest("A driver needs a name.");
    if (body.vehicle != null && typeof body.vehicle !== "string") return badRequest("vehicle must be text.");
    if (body.driverId != null && typeof body.driverId !== "string") return badRequest("driverId must be text.");

    const auth = await authorize("movement.assign");
    if (!auth.ok) return auth.response;

    const driver = await getRepository().saveDriver({
      driverId: body.driverId ?? undefined,
      name: body.name,
      vehicle: body.vehicle as string | null | undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
    }, auth.displayName);
    return Response.json({ driver });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (/already on file|needs a name/.test(message)) return badRequest(message);
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    return jsonError(error);
  }
}
