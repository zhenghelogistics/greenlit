/**
 * §10. Documents.
 *
 * Not generic attachments. Every file carries the metadata that lets someone
 * answer "where did this number come from" months later, which is the question
 * a demurrage dispute actually turns on.
 */

/** §10. Shared, import and export types. */
export const DOCUMENT_TYPE = [
  // Shared
  'COMMERCIAL_INVOICE', 'PACKING_LIST', 'VGM', 'SHIPPING_INSTRUCTION',
  'PROOF_OF_DELIVERY', 'OTHER',
  // Import
  'ARRIVAL_NOTICE', 'BILL_OF_LADING', 'HOUSE_BILL_OF_LADING', 'PERMIT',
  'PORTNET_RELEASE', 'DELIVERY_ORDER', 'EMPTY_RETURN_CONFIRMATION',
  // Export
  'BOOKING_CONFIRMATION', 'EXPORT_CLEARANCE', 'CONTAINER_DETAILS_NOTIFICATION',
  'CARPARK_RECEIPT',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPE)[number];

export const DOCUMENT_SOURCE = ['EMAIL', 'MANUAL_UPLOAD', 'API'] as const;
export type DocumentSource = (typeof DOCUMENT_SOURCE)[number];

export const EXTRACTION_STATUS = ['PENDING', 'PARSED', 'FAILED'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUS)[number];

export interface DocumentRecord {
  documentId: string;
  jobId: string;
  containerId: string | null;
  movementId: string | null;
  documentType: DocumentType;
  filename: string;
  /** The path inside the bucket. A signed URL is minted on demand, not stored. */
  storagePath: string;
  byteSize: number | null;
  source: DocumentSource;
  receivedAt: string;
  receivedFrom: string | null;
  version: number;
  isCurrentVersion: boolean;
  extractionStatus: ExtractionStatus;
  uploadedBy: string;
}

/**
 * What a file is, guessed from its name.
 *
 * A starting point a person corrects, never a decision. Carriers name files
 * anything, and "AN_BKKGT3057700.pdf" is an arrival notice while
 * "DB9DCNCT1.PDF" is not obviously anything — so this offers and the uploader
 * confirms.
 */
export function suggestedDocumentType(filename: string): DocumentType {
  const name = filename.toUpperCase();
  if (/ARRIVAL|(^|[^A-Z])AN[_-]|NOA/.test(name)) return 'ARRIVAL_NOTICE';
  if (/BOOKING|BKG|CONF/.test(name)) return 'BOOKING_CONFIRMATION';
  if (/PERMIT/.test(name)) return 'PERMIT';
  if (/CARTAGE|PICKUP|PICK[_-]?UP/.test(name)) return 'DELIVERY_ORDER';
  if (/PACKING/.test(name)) return 'PACKING_LIST';
  if (/INVOICE/.test(name)) return 'COMMERCIAL_INVOICE';
  if (/VGM/.test(name)) return 'VGM';
  if (/\bBL\b|BILL.?OF.?LADING/.test(name)) return 'BILL_OF_LADING';
  return 'OTHER';
}

/**
 * Where a file lives in the bucket.
 *
 * Grouped by job, because that is how anyone looks for one, and prefixed with
 * the version so a corrected notice cannot silently overwrite the original the
 * job was actually worked from.
 */
export function storagePathFor(
  jobId: string, version: number, filename: string,
): string {
  // Anything that is not plainly a filename becomes an underscore: a carrier's
  // name can contain slashes, and a slash would invent a folder.
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120);
  return `${jobId}/v${version}-${safe}`;
}

/** §10. A file with no name cannot be found again. */
export function documentProblem(
  draft: { filename?: string; documentType?: string },
): string | null {
  if (!draft.filename?.trim()) return 'The file needs a name.';
  if (draft.documentType && !DOCUMENT_TYPE.includes(draft.documentType as DocumentType)) {
    return `${draft.documentType} is not a document type this system knows.`;
  }
  return null;
}
