import { can, type Permission } from "@greenlit/engine";
import { authConfigured, currentPrincipal } from "./auth";
import { getJobService, getRepository, jsonError } from "./greenlit";

/**
 * §7 and §14.1: "Server-side permission validation. Never rely solely on
 * frontend checks."
 *
 * The actor is no longer a parameter. It used to arrive in the request body,
 * which meant roles were enforced against a claim: anyone reaching the API
 * could send actor: "john", act as an administrator, and have the audit trail
 * name John. §13 exists so a change traces to a person, and that only holds
 * if the person is established rather than asserted.
 *
 * The session says who. The directory says what they may do.
 */
/**
 * §7 and §13. What the signed-in person may do.
 *
 * The actor is no longer a parameter. It used to arrive in the request body,
 * which meant the roles were enforced against a claim: anyone who could reach
 * the API could send actor: "john" and act as an administrator, and the audit
 * trail would name John. §13 exists so a change can be traced to a person, and
 * that only holds if the person is established rather than asserted.
 *
 * Callers pass nothing. The session says who; the directory says what they may
 * do; a request body says neither.
 */
export async function authorize(
  permission: Permission,
): Promise<{ ok: true; displayName: string } | { ok: false; response: Response }> {
  if (!authConfigured()) {
    return {
      ok: false,
      response: Response.json({
        error: "Sign-in is not configured on this deployment, so no command can be "
          + "attributed to anyone. Set NEXT_PUBLIC_SUPABASE_URL and "
          + "NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      }, { status: 503 }),
    };
  }

  const principal = await currentPrincipal();
  if (!principal) {
    return {
      ok: false,
      response: Response.json({ error: "Sign in to continue" }, { status: 401 }),
    };
  }
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
