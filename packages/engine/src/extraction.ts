/**
 * Extraction safety — §11.1, §11.4, §11.5 and §12.
 *
 * §5.4 names two capabilities the source extraction engine does not have and
 * which must be added: per-field provenance, and the discrepancy path. This
 * module is both. It is pure: text arrives already parsed, and what leaves is
 * a decision about what may be written.
 */

/** §11.3 */
export type MatchOutcome = 'AUTO_MATCH' | 'REVIEW_REQUIRED' | 'UNMATCHED';

/**
 * §11.1. Every extracted field carries four values, not one.
 *
 * The four travel together deliberately. A value without its source cannot be
 * audited, and a value without its confidence cannot be triaged — which is
 * why a parallel `values` map plus a separate `confidence` map is not the same
 * thing, however similar it looks.
 */
export interface ExtractedField<T = string> {
  value: T;
  /** The document the value came from, e.g. "NOA.pdf". */
  source: string;
  /** 0–1. §11.3 compares this against the configured match threshold. */
  confidence: number;
  extractedAt: string;
}

export const field = <T>(
  value: T, source: string, confidence: number, extractedAt: string,
): ExtractedField<T> => ({ value, source, confidence, extractedAt });

/**
 * §12. Critical operational fields.
 *
 * "Extracted information must never silently overwrite critical operational
 * information." An extracted value that conflicts with one of these raises a
 * discrepancy and leaves the stored value in place; the controller decides
 * which becomes current, and that decision is audited.
 */
export const CRITICAL_FIELDS: readonly string[] = [
  'containerNumber',
  'blNumber',
  'permitNumber',
  'eta',
  'deliveryAddress',
  'carrier',
  'emptyReturnYard',
  'demurrageFreeDays',
  'detentionFreeDays',
  'vgm',
  'bookingReference',
  'exportClearanceReference',
];

export interface Discrepancy {
  field: string;
  storedValue: unknown;
  extractedValue: unknown;
  source: string;
  confidence: number;
  detectedAt: string;
  reason: string;
}

export interface ReconcileResult {
  /** Fields safe to write. Non-critical, or critical and previously empty. */
  updates: Record<string, unknown>;
  /** §12. Raised for review; the stored value stays. */
  discrepancies: Discrepancy[];
  /** Fields skipped because the incoming value matched what was stored. */
  unchanged: string[];
}

const isEmpty = (v: unknown) =>
  v === null || v === undefined || v === '' ||
  (Array.isArray(v) && v.length === 0);

/**
 * §12. Decide what an extraction may write.
 *
 * A critical field that already holds a value is never overwritten. Filling a
 * critical field that was empty is not a conflict — there is nothing to
 * contradict — so it is applied and the provenance recorded.
 */
export function reconcileExtraction(
  stored: Record<string, unknown>,
  extracted: Record<string, ExtractedField<unknown>>,
  options: { criticalFields?: readonly string[]; minConfidence?: number } = {},
): ReconcileResult {
  const critical = new Set(options.criticalFields ?? CRITICAL_FIELDS);
  const minConfidence = options.minConfidence ?? 0;

  const updates: Record<string, unknown> = {};
  const discrepancies: Discrepancy[] = [];
  const unchanged: string[] = [];

  for (const [name, incoming] of Object.entries(extracted)) {
    if (isEmpty(incoming.value)) continue;

    const current = stored[name];

    if (!isEmpty(current) && current === incoming.value) {
      unchanged.push(name);
      continue;
    }

    if (critical.has(name) && !isEmpty(current)) {
      discrepancies.push({
        field: name,
        storedValue: current,
        extractedValue: incoming.value,
        source: incoming.source,
        confidence: incoming.confidence,
        detectedAt: incoming.extractedAt,
        reason: `Extracted ${name} conflicts with the stored value; the stored value is unchanged pending review`,
      });
      continue;
    }

    // Low-confidence values never update a job silently, critical or not.
    if (incoming.confidence < minConfidence) {
      discrepancies.push({
        field: name,
        storedValue: current ?? null,
        extractedValue: incoming.value,
        source: incoming.source,
        confidence: incoming.confidence,
        detectedAt: incoming.extractedAt,
        reason: `Confidence ${incoming.confidence} is below the ${minConfidence} threshold`,
      });
      continue;
    }

    updates[name] = incoming.value;
  }

  return { updates, discrepancies, unchanged };
}

/**
 * §11.4, export safety rule 2. An extracted VGM never overwrites an existing
 * VGM; a conflicting value raises a discrepancy.
 *
 * Separate from the general rule because a VGM is a legal declaration, and
 * because §43 additionally requires it to exceed tare.
 */
export function reconcileVgm(
  storedVgm: number | null,
  incoming: ExtractedField<number>,
  tareWeightKg: number | null,
  /**
   * §43.1. VGM is the total gross mass of the FINISHED container, so it can
   * only come from the final stuffing location. Default true for the common
   * single-location case.
   */
  stuffingComplete = true,
): { accepted: boolean; discrepancy: Discrepancy | null } {
  const base = {
    field: 'vgm', storedValue: storedVgm, extractedValue: incoming.value,
    source: incoming.source, confidence: incoming.confidence,
    detectedAt: incoming.extractedAt,
  };

  if (!stuffingComplete) {
    // §43.1: the likeliest causes are a partial figure or a figure against the
    // wrong container. Storing either produces a VGM that is wrong and looks right.
    return { accepted: false, discrepancy: { ...base,
      reason: 'Stuffing transfers are still outstanding; a VGM cannot exist until the container is finished' } };
  }
  if (storedVgm !== null && storedVgm !== incoming.value) {
    return { accepted: false, discrepancy: { ...base,
      reason: 'A VGM is already recorded; an extracted value never overwrites it' } };
  }
  if (tareWeightKg !== null && incoming.value <= tareWeightKg) {
    return { accepted: false, discrepancy: { ...base,
      reason: `VGM ${incoming.value}kg is at or below tare ${tareWeightKg}kg, which is impossible` } };
  }
  return { accepted: true, discrepancy: null };
}

/**
 * §11.4, export safety rule 1. A VGM or container-ready confirmation may be
 * matched on container number or job number ONLY.
 *
 * A booking reference is shared across jobs often enough that a customer
 * reference alone is not sufficient evidence to record a VGM.
 */
export const READINESS_MATCH_KEYS: readonly string[] = ['jobNumber', 'containerNumber'];

export function canMatchReadiness(matchedOn: readonly string[]): boolean {
  return matchedOn.some((key) => READINESS_MATCH_KEYS.includes(key));
}

/**
 * §11.3. Automation must not force uncertain matches.
 *
 * Exactly one strong candidate auto-matches. Several candidates, or one below
 * the threshold, goes to review. None stays unmatched and is never guessed
 * onto a job.
 */
export function matchOutcome(
  candidates: readonly { jobId: string; confidence: number }[],
  threshold: number,
): MatchOutcome {
  if (candidates.length === 0) return 'UNMATCHED';
  const strong = candidates.filter((c) => c.confidence >= threshold);
  if (strong.length === 1) return 'AUTO_MATCH';
  return 'REVIEW_REQUIRED';
}

/**
 * §11.5. Email automation must be idempotent: processing the same email twice
 * must not create duplicate jobs, documents, containers, movements or events.
 *
 * The key is the external message id plus attachment hashes, so a redelivery
 * of the same message with the same attachments is recognised as already seen.
 */
export function idempotencyKey(
  externalMessageId: string,
  attachmentHashes: readonly string[] = [],
): string {
  return [externalMessageId, ...[...attachmentHashes].sort()].join('|');
}

export function isAlreadyProcessed(
  key: string, processedKeys: ReadonlySet<string>,
): boolean {
  return processedKeys.has(key);
}

/**
 * Adapts the arrival-notice parser's output into §11.1 envelopes.
 *
 * The parser emits `values` and a parallel `confidence` map keyed by the same
 * field names, with confidence as a coarse label rather than a number. Neither
 * carries a source or a timestamp, so the two maps cannot be audited on their
 * own — this is where the missing provenance is attached.
 */
const CONFIDENCE_BY_LABEL: Record<string, number> = {
  high: 0.95,
  review: 0.6,
  edited: 1,      // a person typed it, so it is certain by definition
  missing: 0,
};

export function toExtractedFields(
  values: Record<string, unknown>,
  confidence: Record<string, string>,
  source: string,
  extractedAt: string,
): Record<string, ExtractedField<unknown>> {
  const out: Record<string, ExtractedField<unknown>> = {};
  for (const [name, value] of Object.entries(values)) {
    const label = confidence[name] ?? 'missing';
    out[name] = {
      value,
      source,
      confidence: CONFIDENCE_BY_LABEL[label] ?? 0,
      extractedAt,
    };
  }
  return out;
}
