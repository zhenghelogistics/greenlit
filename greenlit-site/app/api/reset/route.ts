import { resetRepository } from "../../../lib/greenlit";

/**
 * Discard everything and rebuild from the seeded fixtures.
 *
 * Refused in production. Today the repository is in-memory and a reset costs
 * nothing, but the same call against a real database would delete a day's
 * work — so the guard goes in now, while it is harmless, rather than after
 * Supabase makes it dangerous.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return Response.json(
      { error: "Reset is not available in production" },
      { status: 403 },
    );
  }
  const result = resetRepository();
  if (!result.reset) {
    return Response.json({ error: result.reason }, { status: 409 });
  }
  return Response.json({ ok: true, message: "Rebuilt from the seeded fixtures" });
}
