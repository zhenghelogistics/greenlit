import { createMemoryRepository, JobService, type Repository } from "@greenlit/core";

/**
 * One repository per server process, so commands recorded through the API are
 * visible to subsequent reads. Dummy data only — Supabase replaces this with a
 * Postgres adapter and nothing else in the app changes.
 */
let repository: Repository | null = null;
let service: JobService | null = null;

export function getJobService(): JobService {
  if (!service) {
    repository = repository ?? createMemoryRepository();
    service = new JobService(repository);
  }
  return service;
}

export function getRepository(): Repository {
  repository = repository ?? createMemoryRepository();
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
  repository = createMemoryRepository();
  service = new JobService(repository);
}

export function jsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json({ error: message }, { status });
}
