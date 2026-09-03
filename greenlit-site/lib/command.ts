import { can, type Permission } from "@greenlit/engine";
import { getJobService, getRepository, jsonError } from "./greenlit";

/**
 * §7 and §14.1: "Server-side permission validation. Never rely solely on
 * frontend checks."
 *
 * The caller names itself in `actor`, which is not proof of anything — that is
 * what sign-in will add. What this does enforce is that the named user exists,
 * is active, and holds the permission. A caller naming a manager cannot run a
 * controller's command, whatever the interface let them click.
 */
export async function authorize(
  actor: string, permission: Permission,
): Promise<{ ok: true; displayName: string } | { ok: false; response: Response }> {
  const principal = await getRepository().getPrincipal(actor);
  const verdict = can(principal, permission);
  if (!verdict.allowed) {
    return {
      ok: false,
      response: Response.json(
        { error: verdict.reason ?? "Not permitted", permission },
        { status: principal ? 403 : 401 },
      ),
    };
  }
  return { ok: true, displayName: principal!.displayName };
}

/**
 * Shared shape for every command route.
 *
 * §54: derived values are read-only. A command records a *milestone* — permit
 * received, CMS completed, VGM captured — and the engine recomputes everything
 * downstream. That is why each route returns the freshly derived job rather
 * than an acknowledgement: the caller sees the consequence, not just the write.
 */
export async function runCommand(
  jobId: string,
  apply: (repo: ReturnType<typeof getRepository>) => Promise<void>,
) {
  try {
    await apply(getRepository());
    const job = await getJobService().getJob(jobId);
    if (!job) return Response.json({ error: `Unknown job ${jobId}` }, { status: 404 });
    return Response.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    // An unknown id is the caller's mistake, not a server fault.
    if (/^Unknown /.test(message)) return Response.json({ error: message }, { status: 404 });
    return jsonError(error);
  }
}

/** Reads a JSON body, returning null rather than throwing on malformed input. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try { return (await request.json()) as T; } catch { return null; }
}

export const badRequest = (message: string) =>
  Response.json({ error: message }, { status: 400 });
