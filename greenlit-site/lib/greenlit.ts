import { createMemoryRepository, JobService, type Repository } from "@greenlit/core";
import { createSupabaseRepository } from "@greenlit/db";

/**
 * One repository per server process, so commands recorded through the API are
 * visible to subsequent reads. Dummy data only — Supabase replaces this with a
 * Postgres adapter and nothing else in the app changes.
 */
let repository: Repository | null = null;
let service: JobService | null = null;

/**
 * Supabase when it is configured, in-memory otherwise.
 *
 * The fallback is not a convenience — it is what keeps tests, CI and local work
 * running with no credentials at all. ADR-0001 built the port for exactly this
 * moment: one new implementation, and nothing else in the codebase changes.
 */
function createRepository(): Repository {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceRoleKey) {
    return createSupabaseRepository({ url, serviceRoleKey });
  }
  return createMemoryRepository();
}

/** Which backing store is live. Reported by /api/health so it is never a guess. */
export function storageKind(): "supabase" | "memory" {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "memory";
}

export function getJobService(): JobService {
  if (!service) {
    repository = repository ?? createRepository();
    service = new JobService(repository);
  }
  return service;
}

export function getRepository(): Repository {
  repository = repository ?? createRepository();
  return repository;
}

/**
 * Discards all in-memory state and rebuilds from the seeded fixtures.
 *
 * Only meaningful while the repository is in-memory: once Supabase is behind
 * the port this becomes destructive, so the route that calls it refuses to run
 * in production.
 */
export function resetRepository(): void {
  // Deliberately always in-memory: against a real database this would delete
  // real work, and the route that calls it refuses in production anyway.
  repository = createMemoryRepository();
  service = new JobService(repository);
}

export function jsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json({ error: message }, { status });
}
