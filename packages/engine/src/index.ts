/**
 * @greenlit/engine — the derivation layer.
 *
 * §3: `current_location`, `next_action_required` and `blocking_reason` may
 * never be typed by a user. They are computed here, server-side, from stored
 * milestones and movement records.
 *
 * This package has no framework dependencies by design, so it can be lifted
 * into the monorepo at `packages/engine` without change.
 */
export * from './enums.ts';
export * from './types.ts';
export * from './gates.ts';
export * from './location.ts';
export * from './status.ts';
export * from './next-action.ts';
export { IMPORT_RULES, type ImportCtx } from './rules-import.ts';
export { EXPORT_RULES, type ExportCtx } from './rules-export.ts';
