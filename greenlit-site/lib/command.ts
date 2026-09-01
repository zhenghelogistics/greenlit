import { getJobService, getRepository, jsonError } from "./greenlit";

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
