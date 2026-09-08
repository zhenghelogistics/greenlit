/**
 * @greenlit/db — the Supabase implementation of the Repository port.
 *
 * ADR-0001: swapping storage is one new implementation of the same interface
 * and no other change. The contract suite in @greenlit/core is what proves it.
 */
export { createSupabaseRepository, type SupabaseRepositoryOptions } from './supabase.ts';
